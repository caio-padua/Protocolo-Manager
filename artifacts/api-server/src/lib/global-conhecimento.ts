/**
 * Cérebro Global multiclínica.
 *  - Base LOCAL: cada clínica guarda suas perguntas em tabelas com empresa_id (tenant).
 *  - Base GLOBAL: tabela `global_knowledge_base`, SEM empresa_id, só com pergunta anonimizada, domínio e ramo.
 * Exige consentimento da clínica (base_global_licencas.contribui / .consome) e passa pelo filtro de anonimização.
 * A origem fica apenas como hash com sal (nunca o id da clínica).
 */
import { createHash, createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { anonimizarParaGlobal, type ContextoAnonimizacao } from "./global-anonimizador";
import { lerLicenca, migrarBaseGlobal, type ExecutorGlobal } from "./base-global-intencoes";
import { classificarIntencaoWhatsapp } from "./atendimento-whatsapp";
import { ramificacaoDaIntencao } from "./atendimento-taxonomia";
import { normalizarPerguntaAprendida } from "./telegram-aprendiz";

export async function migrarConhecimentoGlobal(exec: ExecutorGlobal = db): Promise<void> {
  await migrarBaseGlobal(exec);
  await exec.execute(sql`CREATE TABLE IF NOT EXISTS global_knowledge_base (
    id BIGSERIAL PRIMARY KEY,
    pergunta_anonimizada TEXT NOT NULL,
    pergunta_hash TEXT NOT NULL UNIQUE,
    dominio TEXT NOT NULL,
    ramo TEXT NOT NULL,
    intencao TEXT,
    origem_hash TEXT NOT NULL,
    ocorrencias INTEGER NOT NULL DEFAULT 1,
    ativa BOOLEAN NOT NULL DEFAULT TRUE,
    revisada BOOLEAN NOT NULL DEFAULT FALSE,
    criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
}

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
function origemHash(empresaId: number): string {
  const sal = process.env.SESSION_SECRET;
  if (!sal) throw new Error("sal_de_origem_ausente");
  return createHmac("sha256", sal).update(`empresa:${empresaId}`).digest("hex");
}

/** Contexto local usado só para EXPURGAR: nomes de pessoas, de clínicas e substâncias. Nada disso é gravado. */
export async function contextoDeAnonimizacao(empresaId: number, exec: ExecutorGlobal = db): Promise<ContextoAnonimizacao> {
  const [p, c, s] = await Promise.all([
    exec.execute(sql`SELECT name AS n FROM clients WHERE empresa_id=${empresaId} AND name IS NOT NULL
      UNION SELECT name FROM professionals WHERE empresa_id=${empresaId} AND name IS NOT NULL`),
    exec.execute(sql`SELECT nome AS n FROM empresas`),
    exec.execute(sql`SELECT DISTINCT name AS n FROM substances WHERE name IS NOT NULL LIMIT 2000`).catch(() => ({ rows: [] })),
  ]);
  const col = (r: { rows: unknown[] }) => (r.rows as { n: string }[]).map((x) => x.n);
  return { nomesPessoas: col(p), nomesClinicas: col(c), substancias: col(s) };
}

async function auditar(exec: ExecutorGlobal, empresaId: number, resultado: "ok" | "recusado", motivo: string, por: string) {
  await exec.execute(sql`INSERT INTO base_global_auditoria (empresa_id,acao,resultado,motivo,por) VALUES (${empresaId},'promocao_livre',${resultado},${motivo},${por})`);
}

export type ResultadoPromocaoLivre =
  | { ok: true; id: number; criada: boolean; texto: string; dominio: string; ramo: string; trocas: string[] }
  | { ok: false; motivo: string; parcial?: string; trocas?: string[] };

/** Captura → anonimiza → categoriza → grava na base global. Recusa sem consentimento ou diante de dado clínico. */
export async function promoverPerguntaParaGlobal(
  p: { empresaId: number; pergunta: string; por: string }, exec: ExecutorGlobal = db,
): Promise<ResultadoPromocaoLivre> {
  const lic = await lerLicenca(p.empresaId, exec);
  if (!lic.contribui) { await auditar(exec, p.empresaId, "recusado", "sem_consentimento_de_contribuicao", p.por); return { ok: false, motivo: "sem_consentimento_de_contribuicao" }; }
  const r = anonimizarParaGlobal(p.pergunta, await contextoDeAnonimizacao(p.empresaId, exec));
  if (!r.ok) { await auditar(exec, p.empresaId, "recusado", r.motivo, p.por); return { ok: false, motivo: r.motivo, parcial: r.parcial, trocas: r.trocas }; }
  const intencao = classificarIntencaoWhatsapp(r.texto);
  const ram = ramificacaoDaIntencao(intencao);
  const h = hash(normalizarPerguntaAprendida(r.texto));
  const ins = await exec.execute(sql`INSERT INTO global_knowledge_base (pergunta_anonimizada,pergunta_hash,dominio,ramo,intencao,origem_hash)
    VALUES (${r.texto},${h},${ram.tronco},${ram.ramo},${intencao},${origemHash(p.empresaId)})
    ON CONFLICT (pergunta_hash) DO UPDATE SET ocorrencias=global_knowledge_base.ocorrencias+1 RETURNING id,(xmax=0) AS criada`);
  const row = ins.rows[0] as { id: number | string; criada: boolean };
  await auditar(exec, p.empresaId, "ok", `global_knowledge_base#${row.id}`, p.por);
  return { ok: true, id: Number(row.id), criada: row.criada, texto: r.texto, dominio: ram.tronco, ramo: ram.ramo, trocas: r.trocas };
}

/** Clínica B (com consentimento de consumo): reconhece pergunta já aprendida por outra clínica. Devolve só domínio/ramo. */
export async function consultarConhecimentoGlobal(
  empresaId: number, texto: string, exec: ExecutorGlobal = db,
): Promise<{ id: number; dominio: string; ramo: string; intencao: string | null } | null> {
  const lic = await lerLicenca(empresaId, exec);
  if (!lic.consome) return null;
  const r = anonimizarParaGlobal(texto, await contextoDeAnonimizacao(empresaId, exec));
  if (!r.ok) return null;
  const q = await exec.execute(sql`SELECT id,dominio,ramo,intencao FROM global_knowledge_base
    WHERE pergunta_hash=${hash(normalizarPerguntaAprendida(r.texto))} AND ativa=TRUE AND origem_hash<>${origemHash(empresaId)} LIMIT 1`);
  const x = q.rows[0] as { id: number | string; dominio: string; ramo: string; intencao: string | null } | undefined;
  return x ? { id: Number(x.id), dominio: x.dominio, ramo: x.ramo, intencao: x.intencao } : null;
}
