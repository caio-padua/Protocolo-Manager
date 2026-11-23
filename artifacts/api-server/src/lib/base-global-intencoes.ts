/**
 * Base Global PAXMED de intenções e variações genéricas.
 * Separada do conhecimento de cada clínica e dos dados individuais.
 * - Só guarda intenção (da lista fechada de troncos/ramos) + variações linguísticas sem identificadores.
 * - Nunca copia conversa bruta, resposta, nome, número, e-mail, endereço ou termo clínico.
 * - Se a limpeza não for segura, a promoção é RECUSADA (nada é "consertado" às cegas).
 * - Origem fica só como hash com sal, em tabela restrita; a autorização da clínica é obrigatória.
 * Não promete anonimização perfeita nem conformidade jurídica automática: a revisão humana continua necessária.
 */
import { createHash, createHmac } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";
import { ramificacaoValida } from "./atendimento-taxonomia";
import { normalizarPerguntaAprendida } from "./telegram-aprendiz";

export interface ExecutorGlobal { execute: (q: SQL) => Promise<{ rows: unknown[] }> }

export async function migrarBaseGlobal(exec: ExecutorGlobal = db): Promise<void> {
  await exec.execute(sql`CREATE TABLE IF NOT EXISTS base_global_intencoes (
    id BIGSERIAL PRIMARY KEY,
    chave TEXT NOT NULL UNIQUE,
    dominio TEXT NOT NULL DEFAULT 'atendimento_clinico',
    tronco TEXT NOT NULL, ramo TEXT NOT NULL,
    descricao TEXT NOT NULL DEFAULT '',
    ativa BOOLEAN NOT NULL DEFAULT TRUE,
    criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizada_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await exec.execute(sql`CREATE TABLE IF NOT EXISTS base_global_variacoes (
    id BIGSERIAL PRIMARY KEY,
    intencao_id BIGINT NOT NULL REFERENCES base_global_intencoes(id),
    texto TEXT NOT NULL,
    texto_hash TEXT NOT NULL,
    ativa BOOLEAN NOT NULL DEFAULT TRUE,
    revisada BOOLEAN NOT NULL DEFAULT FALSE,
    criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (intencao_id, texto_hash))`);
  // Origem e autorização: restrito, sem texto de conversa.
  await exec.execute(sql`CREATE TABLE IF NOT EXISTS base_global_origens (
    id BIGSERIAL PRIMARY KEY,
    variacao_id BIGINT NOT NULL REFERENCES base_global_variacoes(id),
    origem_hash TEXT NOT NULL,
    autorizado_por TEXT NOT NULL,
    criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (variacao_id, origem_hash))`);
  await exec.execute(sql`CREATE TABLE IF NOT EXISTS base_global_licencas (
    empresa_id INTEGER PRIMARY KEY,
    contribui BOOLEAN NOT NULL DEFAULT FALSE,
    consome BOOLEAN NOT NULL DEFAULT FALSE,
    autorizado_por TEXT, autorizado_em TIMESTAMPTZ,
    atualizada_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await exec.execute(sql`CREATE TABLE IF NOT EXISTS base_global_consumos (
    empresa_id INTEGER NOT NULL, intencao_id BIGINT NOT NULL,
    usos BIGINT NOT NULL DEFAULT 0, ultimo_uso TIMESTAMPTZ,
    PRIMARY KEY (empresa_id, intencao_id))`);
  await exec.execute(sql`CREATE TABLE IF NOT EXISTS base_global_auditoria (
    id BIGSERIAL PRIMARY KEY,
    empresa_id INTEGER, acao TEXT NOT NULL, intencao_id BIGINT, variacao_id BIGINT,
    resultado TEXT NOT NULL, motivo TEXT, por TEXT,
    criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
}

// ── Limpeza: recusa em vez de remendar ───────────────────────────────────────
const PALAVRAS_CLINICAS = /\b(dor|dores|sintoma|sintomas|reacao|efeito|medicacao|medicamento|remedio|dose|dosagem|diagnostico|exame|resultado|pressao|febre|nausea|alergia|prescricao|receita|hormonio|tratamento|doenca|cirurgia|gravida|gravidez)\b/;
const PALAVRAS_SENSIVEIS = /\b(cpf|rg|cnpj|nascimento|nasci|telefone|celular|whatsapp|email|e-mail|endereco|rua|avenida|cep|senha|cartao|pix|preco|valor|reais|desconto)\b/;
const TITULOS_E_NOMES = /\b(dr|dra|doutor|doutora|sr|sra|senhor|senhora|meu nome|me chamo|aqui e)\b/;

export type ResultadoLimpeza = { ok: true; texto: string } | { ok: false; motivo: string };

export function limparVariacaoParaBaseGlobal(original: string): ResultadoLimpeza {
  const bruto = (original ?? "").trim();
  if (!bruto) return { ok: false, motivo: "texto_vazio" };
  if (bruto.length > 200) return { ok: false, motivo: "texto_longo_demais" };
  if (/\d/.test(bruto)) return { ok: false, motivo: "contem_numero" };
  if (/@|https?:|www\./i.test(bruto)) return { ok: false, motivo: "contem_endereco_digital" };
  // Palavra capitalizada fora do início pode ser nome próprio: não dá para separar com segurança.
  const palavras = bruto.split(/\s+/);
  if (palavras.slice(1).some((p) => /^\p{Lu}\p{Ll}{2,}/u.test(p.replace(/^[("'¿]+/, "")))) return { ok: false, motivo: "possivel_nome_proprio" };
  const norm = normalizarPerguntaAprendida(bruto);
  if (norm.split(" ").filter(Boolean).length < 3) return { ok: false, motivo: "curto_demais" };
  if (PALAVRAS_CLINICAS.test(norm)) return { ok: false, motivo: "termo_clinico" };
  if (PALAVRAS_SENSIVEIS.test(norm)) return { ok: false, motivo: "termo_sensivel" };
  if (TITULOS_E_NOMES.test(norm)) return { ok: false, motivo: "identificacao_pessoal" };
  return { ok: true, texto: norm };
}

const hashTexto = (t: string) => createHash("sha256").update(t).digest("hex");
function origemHash(empresaId: number): string {
  const sal = process.env.SESSION_SECRET;
  if (!sal) throw new Error("sal_de_origem_ausente");
  return createHmac("sha256", sal).update(`empresa:${empresaId}`).digest("hex");
}

async function auditar(exec: ExecutorGlobal, p: { empresaId: number | null; acao: string; intencaoId?: number | null; variacaoId?: number | null; resultado: "ok" | "recusado"; motivo?: string; por: string }) {
  await exec.execute(sql`INSERT INTO base_global_auditoria (empresa_id,acao,intencao_id,variacao_id,resultado,motivo,por)
    VALUES (${p.empresaId},${p.acao},${p.intencaoId ?? null},${p.variacaoId ?? null},${p.resultado},${p.motivo ?? null},${p.por})`);
}

export async function definirLicenca(p: { empresaId: number; contribui: boolean; consome: boolean; por: string }, exec: ExecutorGlobal = db) {
  await exec.execute(sql`INSERT INTO base_global_licencas (empresa_id,contribui,consome,autorizado_por,autorizado_em)
    VALUES (${p.empresaId},${p.contribui},${p.consome},${p.por},NOW())
    ON CONFLICT (empresa_id) DO UPDATE SET contribui=EXCLUDED.contribui,consome=EXCLUDED.consome,
      autorizado_por=EXCLUDED.autorizado_por,autorizado_em=NOW(),atualizada_em=NOW()`);
  await auditar(exec, { empresaId: p.empresaId, acao: "licenca", resultado: "ok", motivo: `contribui=${p.contribui};consome=${p.consome}`, por: p.por });
}

export async function lerLicenca(empresaId: number, exec: ExecutorGlobal = db) {
  const r = await exec.execute(sql`SELECT contribui,consome FROM base_global_licencas WHERE empresa_id=${empresaId}`);
  const x = r.rows[0] as { contribui: boolean; consome: boolean } | undefined;
  return { contribui: x?.contribui === true, consome: x?.consome === true };
}

export type ResultadoPromocao = { ok: true; variacaoId: number; criada: boolean } | { ok: false; motivo: string };

/**
 * Promove UMA pergunta inédita da própria clínica. Lê somente o registro com empresa_id da clínica,
 * exige contribuição autorizada, recusa se a limpeza não for segura e grava só a variação limpa.
 */
export async function promoverVariacaoParaBaseGlobal(
  p: { empresaId: number; perguntaInedita: number; intencaoChave: string; por: string },
  exec: ExecutorGlobal = db,
): Promise<ResultadoPromocao> {
  const recusa = async (motivo: string, variacaoId?: number): Promise<ResultadoPromocao> => {
    await auditar(exec, { empresaId: p.empresaId, acao: "promocao", variacaoId, resultado: "recusado", motivo, por: p.por });
    return { ok: false, motivo };
  };
  const lic = await lerLicenca(p.empresaId, exec);
  if (!lic.contribui) return recusa("clinica_sem_autorizacao_de_contribuicao");
  const i = await exec.execute(sql`SELECT id,tronco,ramo FROM base_global_intencoes WHERE chave=${p.intencaoChave} AND ativa=TRUE`);
  const intencao = i.rows[0] as { id: number | string; tronco: string; ramo: string } | undefined;
  if (!intencao || !ramificacaoValida(intencao.tronco, intencao.ramo)) return recusa("intencao_inexistente_ou_inativa");
  const q = await exec.execute(sql`SELECT pergunta FROM atendimento_perguntas_ineditas WHERE id=${p.perguntaInedita} AND empresa_id=${p.empresaId}`);
  const origem = q.rows[0] as { pergunta: string } | undefined;
  if (!origem) return recusa("pergunta_nao_encontrada_nesta_clinica");
  const limpa = limparVariacaoParaBaseGlobal(origem.pergunta);
  if (!limpa.ok) return recusa(limpa.motivo);
  const h = hashTexto(limpa.texto);
  const ins = await exec.execute(sql`INSERT INTO base_global_variacoes (intencao_id,texto,texto_hash)
    VALUES (${Number(intencao.id)},${limpa.texto},${h}) ON CONFLICT (intencao_id,texto_hash) DO NOTHING RETURNING id`);
  let variacaoId: number; let criada = ins.rows.length > 0;
  if (criada) variacaoId = Number((ins.rows[0] as { id: number | string }).id);
  else {
    const e = await exec.execute(sql`SELECT id FROM base_global_variacoes WHERE intencao_id=${Number(intencao.id)} AND texto_hash=${h}`);
    variacaoId = Number((e.rows[0] as { id: number | string }).id);
  }
  await exec.execute(sql`INSERT INTO base_global_origens (variacao_id,origem_hash,autorizado_por)
    VALUES (${variacaoId},${origemHash(p.empresaId)},${p.por}) ON CONFLICT DO NOTHING`);
  await auditar(exec, { empresaId: p.empresaId, acao: "promocao", intencaoId: Number(intencao.id), variacaoId, resultado: "ok", por: p.por });
  return { ok: true, variacaoId, criada };
}

/** Consulta para clínica licenciada a consumir: devolve a intenção (nunca texto de outra clínica). */
export async function consultarIntencaoGlobal(empresaId: number, texto: string, exec: ExecutorGlobal = db): Promise<{ tronco: string; ramo: string; chave: string } | null> {
  const lic = await lerLicenca(empresaId, exec);
  if (!lic.consome) return null;
  const limpa = limparVariacaoParaBaseGlobal(texto);
  if (!limpa.ok) return null;
  const r = await exec.execute(sql`SELECT i.id,i.chave,i.tronco,i.ramo FROM base_global_variacoes v
    JOIN base_global_intencoes i ON i.id=v.intencao_id
    WHERE v.texto_hash=${hashTexto(limpa.texto)} AND v.ativa=TRUE AND i.ativa=TRUE LIMIT 1`);
  const x = r.rows[0] as { id: number | string; chave: string; tronco: string; ramo: string } | undefined;
  if (!x) return null;
  await exec.execute(sql`INSERT INTO base_global_consumos (empresa_id,intencao_id,usos,ultimo_uso)
    VALUES (${empresaId},${Number(x.id)},1,NOW())
    ON CONFLICT (empresa_id,intencao_id) DO UPDATE SET usos=base_global_consumos.usos+1,ultimo_uso=NOW()`);
  return { tronco: x.tronco, ramo: x.ramo, chave: x.chave };
}

export async function criarIntencaoGlobal(p: { chave: string; tronco: string; ramo: string; descricao: string; por: string }, exec: ExecutorGlobal = db): Promise<boolean> {
  if (!/^[a-z][a-z0-9_]{2,60}$/.test(p.chave) || !ramificacaoValida(p.tronco, p.ramo)) return false;
  await exec.execute(sql`INSERT INTO base_global_intencoes (chave,tronco,ramo,descricao)
    VALUES (${p.chave},${p.tronco},${p.ramo},${p.descricao.slice(0, 200)}) ON CONFLICT (chave) DO NOTHING`);
  await auditar(exec, { empresaId: null, acao: "intencao", resultado: "ok", motivo: p.chave, por: p.por });
  return true;
}

export async function alterarEstadoGlobal(p: { tipo: "intencao" | "variacao"; id: number; ativa: boolean; por: string }, exec: ExecutorGlobal = db): Promise<boolean> {
  const r = p.tipo === "intencao"
    ? await exec.execute(sql`UPDATE base_global_intencoes SET ativa=${p.ativa},atualizada_em=NOW() WHERE id=${p.id} RETURNING id`)
    : await exec.execute(sql`UPDATE base_global_variacoes SET ativa=${p.ativa},revisada=TRUE WHERE id=${p.id} RETURNING id`);
  if (!r.rows.length) return false;
  await auditar(exec, { empresaId: null, acao: p.ativa ? "ativar" : "desativar", intencaoId: p.tipo === "intencao" ? p.id : null, variacaoId: p.tipo === "variacao" ? p.id : null, resultado: "ok", por: p.por });
  return true;
}

/** Visão do CEO global: nunca devolve texto de conversa nem origem identificável. */
export async function painelBaseGlobal(exec: ExecutorGlobal = db) {
  const intencoes = await exec.execute(sql`SELECT i.id,i.chave,i.dominio,i.tronco,i.ramo,i.descricao,i.ativa,
      COUNT(v.id)::int AS variacoes, COUNT(v.id) FILTER (WHERE v.ativa)::int AS "variacoesAtivas",
      (SELECT COALESCE(SUM(c.usos),0)::bigint FROM base_global_consumos c WHERE c.intencao_id=i.id) AS consumo,
      (SELECT COUNT(DISTINCT o.origem_hash)::int FROM base_global_origens o JOIN base_global_variacoes vv ON vv.id=o.variacao_id WHERE vv.intencao_id=i.id) AS "clinicasContribuintes"
    FROM base_global_intencoes i LEFT JOIN base_global_variacoes v ON v.intencao_id=i.id
    GROUP BY i.id ORDER BY i.tronco,i.ramo,i.chave`);
  const licencas = await exec.execute(sql`SELECT l.empresa_id AS "empresaId",e.nome AS clinica,l.contribui,l.consome,l.autorizado_em AS "autorizadoEm"
    FROM base_global_licencas l LEFT JOIN empresas e ON e.id=l.empresa_id ORDER BY e.nome`);
  const historico = await exec.execute(sql`SELECT id,empresa_id AS "empresaId",acao,resultado,motivo,por,criada_em AS "criadaEm"
    FROM base_global_auditoria ORDER BY id DESC LIMIT 100`);
  return { intencoes: intencoes.rows, licencas: licencas.rows, historico: historico.rows };
}

export async function variacoesDaIntencao(id: number, exec: ExecutorGlobal = db) {
  return (await exec.execute(sql`SELECT id,texto,ativa,revisada,criada_em AS "criadaEm" FROM base_global_variacoes WHERE intencao_id=${id} ORDER BY id DESC LIMIT 300`)).rows;
}
