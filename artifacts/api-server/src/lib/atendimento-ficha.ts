/**
 * Ficha auditável do atendimento automático (WhatsApp e Telegram).
 * Fatos são imutáveis (gatilho do banco bloqueia UPDATE e DELETE). Correções e novos estados entram como
 * EVENTOS acrescentados; o estado final é o último evento de estado. Nada aqui sai da clínica dona do registro,
 * nada guarda número completo, segredo ou token, e nada é promovido à Base Global.
 */
import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import type { EntradaAtendimento, PlanoAtendimento } from "./atendimento-telegram";

export type EstadoFicha = "entregue" | "enviado" | "pendente" | "incerto" | "falhou" | "bloqueado" | "encaminhado" | "ignorado";
export const ESTADOS_FICHA: EstadoFicha[] = ["entregue", "enviado", "pendente", "incerto", "falhou", "bloqueado", "encaminhado", "ignorado"];

let pronto: Promise<void> | null = null;
export function garantirFicha(): Promise<void> {
  pronto ??= (async () => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(19872028)");
      await c.query(`CREATE TABLE IF NOT EXISTS atendimento_ficha (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        canal TEXT NOT NULL CHECK (canal IN ('whatsapp','telegram')),
        mensagem_ref TEXT NOT NULL,
        contato_mascarado TEXT NOT NULL,
        tipo_contato TEXT NOT NULL CHECK (tipo_contato IN ('cliente_identificado','visitante','nao_identificado')),
        cliente_id INTEGER,
        evento_entrada_id TEXT,
        fragmentos_ids BIGINT[] NOT NULL DEFAULT '{}',
        recebido_em TIMESTAMPTZ,
        processado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        texto_resumo TEXT,
        intencao_principal TEXT,
        intencoes_adicionais TEXT[] NOT NULL DEFAULT '{}',
        confianca TEXT,
        metodo TEXT CHECK (metodo IN ('regra','palavra_chave','ia','humano')),
        regra TEXT,
        fonte_chave TEXT,
        fonte_versao TEXT,
        fonte_situacao TEXT,
        ia_usada BOOLEAN NOT NULL DEFAULT FALSE,
        ia_modelo TEXT,
        ia_tokens INTEGER,
        ia_custo NUMERIC,
        resposta_texto TEXT,
        resposta_id TEXT,
        duracoes JSONB NOT NULL DEFAULT '{}'::jsonb,
        motivo TEXT,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS atendimento_ficha_unica ON atendimento_ficha (empresa_id, canal, mensagem_ref)`);
      await c.query(`CREATE INDEX IF NOT EXISTS atendimento_ficha_busca ON atendimento_ficha (empresa_id, processado_em DESC)`);
      await c.query(`CREATE TABLE IF NOT EXISTS atendimento_ficha_evento (
        id BIGSERIAL PRIMARY KEY,
        ficha_id BIGINT NOT NULL REFERENCES atendimento_ficha(id),
        empresa_id INTEGER NOT NULL,
        tipo TEXT NOT NULL CHECK (tipo IN ('estado','tentativa','recuperacao','anotacao','correcao')),
        estado TEXT,
        motivo TEXT,
        provider_id TEXT,
        resultado TEXT,
        detalhe JSONB NOT NULL DEFAULT '{}'::jsonb,
        responsavel INTEGER,
        corrige_evento_id BIGINT,
        em TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await c.query(`CREATE INDEX IF NOT EXISTS atendimento_ficha_evento_ficha ON atendimento_ficha_evento (ficha_id, id)`);
      await c.query(`CREATE OR REPLACE FUNCTION atendimento_ficha_imutavel() RETURNS trigger AS $f$
        BEGIN RAISE EXCEPTION 'ficha de atendimento é imutável: registre um evento novo'; END $f$ LANGUAGE plpgsql`);
      for (const t of ["atendimento_ficha", "atendimento_ficha_evento"]) {
        await c.query(`DROP TRIGGER IF EXISTS ${t}_imutavel ON ${t}`);
        await c.query(`CREATE TRIGGER ${t}_imutavel BEFORE UPDATE OR DELETE ON ${t} FOR EACH ROW EXECUTE FUNCTION atendimento_ficha_imutavel()`);
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK").catch(() => undefined);
      pronto = null;
      throw e;
    } finally {
      c.release();
    }
  })();
  return pronto;
}

/** Somente os quatro últimos dígitos; nunca o número completo. */
export function mascararContatoFicha(contato: string): string {
  const d = contato.replace(/\D/g, "");
  return d.length >= 4 ? `***${d.slice(-4)}` : "***";
}

/** Resumo operacional: sequências de dígitos viram asteriscos e o texto é truncado. */
export function resumirTexto(texto: string): string {
  return texto.replace(/\d[\d\s().-]{3,}\d|\d{3,}/g, "***").replace(/\s+/g, " ").trim().slice(0, 140);
}

export const versaoDaFonte = (texto: string | null | undefined): string | null =>
  texto ? createHash("sha256").update(texto).digest("hex").slice(0, 12) : null;

export interface DadosFicha {
  entrada: EntradaAtendimento;
  plano: PlanoAtendimento;
  mensagemRef: string;
  eventoEntradaId?: string | null;
  fragmentos?: number[];
  recebidoEm?: Date | string | null;
  tipoContato?: "cliente_identificado" | "visitante" | "nao_identificado";
  estado: EstadoFicha;
  motivo?: string | null;
  respostaId?: string | null;
  fonteSituacao?: string | null;
  tentativa?: { resultado: string; providerId?: string | null };
}

/** Cria a ficha (uma por mensagem) e acrescenta o evento de estado. Repetição da mesma mensagem não duplica a ficha. */
export async function registrarFicha(d: DadosFicha): Promise<number | null> {
  try {
    await garantirFicha();
    const { entrada: e, plano } = d;
    const principal = plano.intencaoDetectada ?? plano.intencao ?? null;
    const todas = plano.intencoes ?? [];
    const med = plano.medicoes;
    const ia = plano.origemIntencao === "ia" || plano.interpreteChamado || plano.conferenteChamado;
    const duracoes = med ? {
      classificacaoMs: med.classificacaoMs, fonteMs: Math.max(0, med.planejamentoMs - med.classificacaoMs), planejamentoMs: med.planejamentoMs,
    } : {};
    const ins = await pool.query(
      `INSERT INTO atendimento_ficha (empresa_id,canal,mensagem_ref,contato_mascarado,tipo_contato,cliente_id,evento_entrada_id,fragmentos_ids,
         recebido_em,texto_resumo,intencao_principal,intencoes_adicionais,confianca,metodo,regra,fonte_chave,fonte_versao,fonte_situacao,
         ia_usada,resposta_texto,resposta_id,duracoes,motivo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::bigint[],$9,$10,$11,$12::text[],$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23)
       ON CONFLICT (empresa_id,canal,mensagem_ref) DO NOTHING RETURNING id`,
      [e.empresaId, e.canal ?? "telegram", d.mensagemRef, mascararContatoFicha(e.chatId), d.tipoContato ?? "cliente_identificado", e.clienteId,
        d.eventoEntradaId ?? null, d.fragmentos ?? [], d.recebidoEm ?? null, resumirTexto(e.texto), principal,
        todas.filter((x) => x !== principal), principal ? (plano.origemIntencao === "ia" ? "estimada" : "alta") : null,
        plano.origemIntencao === "ia" ? "ia" : plano.caminhoResolucao === "cardapio" ? "palavra_chave" : "regra",
        plano.fonteOperacional?.chave ?? plano.desfecho, plano.fonteOperacional?.chave ?? (plano.orientacaoId ? `orientacao:${plano.orientacaoId}` : null),
        versaoDaFonte(plano.resposta), d.fonteSituacao ?? (plano.fonteOperacional || plano.orientacaoId ? "vigente" : null),
        Boolean(ia), plano.resposta, d.respostaId ?? null, JSON.stringify(duracoes), d.motivo ?? null]);
    const fichaId = ins.rows[0]?.id ?? (await pool.query(
      `SELECT id FROM atendimento_ficha WHERE empresa_id=$1 AND canal=$2 AND mensagem_ref=$3`, [e.empresaId, e.canal ?? "telegram", d.mensagemRef])).rows[0]?.id;
    if (!fichaId) return null;
    if (d.tentativa) {
      await pool.query(`INSERT INTO atendimento_ficha_evento (ficha_id,empresa_id,tipo,resultado,provider_id) VALUES ($1,$2,'tentativa',$3,$4)`,
        [fichaId, e.empresaId, d.tentativa.resultado, d.tentativa.providerId ?? null]);
    }
    await pool.query(`INSERT INTO atendimento_ficha_evento (ficha_id,empresa_id,tipo,estado,motivo,provider_id) VALUES ($1,$2,'estado',$3,$4,$5)`,
      [fichaId, e.empresaId, d.estado, d.motivo ?? null, d.respostaId ?? null]);
    return Number(fichaId);
  } catch {
    return null; // ficha nunca derruba o atendimento; a ausência aparece nos testes e na conferência
  }
}

/** Evento acrescentado a uma ficha existente (recuperação, nova tentativa, anotação, correção). */
export async function acrescentarEvento(p: {
  empresaId: number; canal: "whatsapp" | "telegram"; mensagemRef: string; tipo: "estado" | "tentativa" | "recuperacao" | "anotacao" | "correcao";
  estado?: EstadoFicha; motivo?: string | null; providerId?: string | null; resultado?: string | null; responsavel?: number | null; corrigeEventoId?: number | null;
}): Promise<boolean> {
  try {
    await garantirFicha();
    const r = await pool.query(
      `INSERT INTO atendimento_ficha_evento (ficha_id,empresa_id,tipo,estado,motivo,provider_id,resultado,responsavel,corrige_evento_id)
       SELECT id,empresa_id,$4,$5,$6,$7,$8,$9,$10 FROM atendimento_ficha WHERE empresa_id=$1 AND canal=$2 AND mensagem_ref=$3 RETURNING id`,
      [p.empresaId, p.canal, p.mensagemRef, p.tipo, p.estado ?? null, p.motivo ?? null, p.providerId ?? null, p.resultado ?? null, p.responsavel ?? null, p.corrigeEventoId ?? null]);
    return r.rows.length > 0;
  } catch { return false; }
}

export interface FiltroFicha {
  empresaId: number; de?: string; ate?: string; canal?: string; intencao?: string; estado?: string;
  ia?: boolean; contato?: string; pagina?: number; porPagina?: number;
}

const SELECT_FICHA = `SELECT f.id,f.canal,f.mensagem_ref,f.evento_entrada_id,f.contato_mascarado,f.tipo_contato,f.recebido_em,f.processado_em,f.texto_resumo,
  f.intencao_principal,f.intencoes_adicionais,f.metodo,f.fonte_chave,f.fonte_versao,f.fonte_situacao,f.ia_usada,f.resposta_id,f.motivo,f.duracoes,
  COALESCE((SELECT v.estado FROM atendimento_ficha_evento v WHERE v.ficha_id=f.id AND v.tipo='estado' ORDER BY v.id DESC LIMIT 1),'pendente') AS estado_final,
  (SELECT COUNT(*) FROM atendimento_ficha_evento v WHERE v.ficha_id=f.id AND v.tipo='tentativa')::int AS tentativas`;

export async function listarFichas(f: FiltroFicha) {
  await garantirFicha();
  const porPagina = Math.min(Math.max(f.porPagina ?? 20, 1), 100);
  const pagina = Math.max(f.pagina ?? 1, 1);
  const w: string[] = ["f.empresa_id=$1"];
  const v: unknown[] = [f.empresaId];
  const add = (cond: string, val: unknown) => { v.push(val); w.push(cond.replace("?", `$${v.length}`)); };
  if (f.de) add("f.processado_em >= ?::timestamptz", f.de);
  if (f.ate) add("f.processado_em <= ?::timestamptz", f.ate);
  if (f.canal) add("f.canal = ?", f.canal);
  if (f.intencao) add("(f.intencao_principal = ? )", f.intencao);
  if (f.ia !== undefined) add("f.ia_usada = ?", f.ia);
  if (f.contato) add("f.contato_mascarado = ?", f.contato);
  const base = `FROM atendimento_ficha f WHERE ${w.join(" AND ")}`;
  const filtroEstado = f.estado ? ` AND COALESCE((SELECT v.estado FROM atendimento_ficha_evento v WHERE v.ficha_id=f.id AND v.tipo='estado' ORDER BY v.id DESC LIMIT 1),'pendente') = $${v.length + 1}` : "";
  const vals = f.estado ? [...v, f.estado] : v;
  const total = await pool.query(`SELECT COUNT(*)::int AS n ${base}${filtroEstado}`, vals);
  const itens = await pool.query(
    `${SELECT_FICHA} ${base}${filtroEstado} ORDER BY f.processado_em DESC, f.id DESC LIMIT ${porPagina} OFFSET ${(pagina - 1) * porPagina}`, vals);
  return { total: total.rows[0].n as number, pagina, porPagina, itens: itens.rows };
}

export async function detalharFicha(empresaId: number, id: number) {
  await garantirFicha();
  const f = await pool.query(`SELECT f.*,${SELECT_FICHA.slice(SELECT_FICHA.indexOf("COALESCE"))} FROM atendimento_ficha f WHERE f.id=$1 AND f.empresa_id=$2`, [id, empresaId]);
  if (!f.rows.length) return null;
  const linha = await pool.query(
    `SELECT id,tipo,estado,motivo,provider_id,resultado,responsavel,corrige_evento_id,em FROM atendimento_ficha_evento WHERE ficha_id=$1 AND empresa_id=$2 ORDER BY id`, [id, empresaId]);
  return { ficha: f.rows[0], linhaDoTempo: linha.rows };
}
