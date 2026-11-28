/**
 * Pedidos de segunda opinião de UNIDADE: registro por pergunta, máquina de estados e consumo atômico.
 *   pending -> approved -> consumed          (rejected | expired | uncertain | failed como saídas)
 * Invariantes: no máximo UMA chamada por autorização (UPDATE condicional), chave e quota conferidas ANTES do
 * consumo, nenhuma gravação em exames.llmOpenaiAtivo, conversão só promovida pelo motor determinístico.
 */
import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import { logAiUsage } from "../ai-central";
import { logger } from "../logger";
import { normUnit } from "../exam-extraction/persist";
import { classificarUnidade, fatorComoNumero, rac, type ClasseUnidade } from "./classificador-unidades";
import {
  CUSTO_ESTIMADO_POR_CONSULTA_USD, ProviderHttpError, chaveOpenAIPresente, consultarOpenAIUnidade,
  montarPayloadUnidade, type RespostaUnidade, type ResultadoChamada,
} from "./revisao-openai";

export type StatusPedido = "pending" | "approved" | "consumed" | "rejected" | "expired" | "uncertain" | "failed";
const CLASSES_ELEGIVEIS_IA: ClasseUnidade[] = ["AMBIGUOUS", "ANALYTE_SPECIFIC", "DIMENSIONAL_CONVERSION"];
export const TETO_PADRAO_POR_PEDIDO_USD = 0.05;
export const LIMITE_PADRAO_DIARIO = 5;
export const TTL_PADRAO_MIN = 30;

export const chaveSemantica = (p: { empresaId: number; scope: string; analyteCode: string; unitOrigin: string; unitTarget: string; context?: string }) =>
  [p.scope === "global" ? "global" : `empresa:${p.empresaId}`, p.analyteCode, normUnit(p.unitOrigin), normUnit(p.unitTarget), p.context ?? ""].join("|");

async function lerSetting(key: string): Promise<string | null> {
  const r = await pool.query(`SELECT value FROM app_settings WHERE key = $1`, [key]);
  return r.rows[0]?.value ?? null;
}
async function lerNumero(key: string, padrao: number): Promise<number> {
  const n = Number(await lerSetting(key));
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

// ── Registro do candidato (chamado pelo motor de extração; NUNCA lança) ──────────────────────────────
export interface CandidatoEntrada { empresaId: number; analyteCode: string; unitRaw: string | null; canonicalUnit: string | null }
export type ResultadoRegistro = "ignorado" | "alias_promovido" | "pedido_novo" | "pedido_existente";

export async function registrarCandidatoUnidade(c: CandidatoEntrada): Promise<ResultadoRegistro> {
  try {
    if (!c.unitRaw || !c.canonicalUnit) return "ignorado";
    const cls = classificarUnidade(c.unitRaw, c.canonicalUnit);
    if (cls.classe === "MATCH_EXISTING") return "ignorado";
    if (cls.classe === "SAFE_ALIAS") {
      return (await promoverAliasSeguro(c.analyteCode, c.unitRaw, c.canonicalUnit, null)) ? "alias_promovido" : "ignorado";
    }
    const scope = "empresa";
    const key = chaveSemantica({ empresaId: c.empresaId, scope, analyteCode: c.analyteCode, unitOrigin: c.unitRaw, unitTarget: c.canonicalUnit });
    const elegivel = CLASSES_ELEGIVEIS_IA.includes(cls.classe);
    const r = await pool.query(
      `INSERT INTO exam_unit_review_request
         (semantic_key, empresa_id, scope, analyte_code, unit_origin_raw, unit_origin_norm, unit_target, unit_class, ai_eligible, cost_est_usd)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (semantic_key) DO UPDATE SET occurrences = exam_unit_review_request.occurrences + 1, updated_at = now()
       RETURNING (xmax = 0) AS novo`,
      [key, c.empresaId, scope, c.analyteCode, c.unitRaw.slice(0, 80), normUnit(c.unitRaw), c.canonicalUnit.slice(0, 80), cls.classe, elegivel, CUSTO_ESTIMADO_POR_CONSULTA_USD],
    );
    return r.rows[0]?.novo ? "pedido_novo" : "pedido_existente";
  } catch (e) {
    logger.error({ err: (e as Error).message, analyteCode: c.analyteCode }, "[UNIDADE_CANDIDATO] falha ao registrar candidato (upload segue)");
    return "ignorado";
  }
}

/** Chamado pelo motor: descobre a clínica pelo documento (servidor), nunca por payload. Nunca lança. */
export async function registrarCandidatoDoDocumento(documentId: number, analyteCode: string, unitRaw: string | null, canonicalUnit: string | null): Promise<ResultadoRegistro> {
  try {
    const d = await pool.query(`SELECT empresa_id FROM exam_documents WHERE id = $1`, [documentId]);
    const empresaId = Number(d.rows[0]?.empresa_id);
    if (!Number.isSafeInteger(empresaId) || empresaId <= 0) return "ignorado";
    return await registrarCandidatoUnidade({ empresaId, analyteCode, unitRaw, canonicalUnit });
  } catch (e) {
    logger.error({ err: (e as Error).message }, "[UNIDADE_CANDIDATO] falha ao resolver clínica do documento");
    return "ignorado";
  }
}

// ── Promoção determinística (aditiva, transacional, idempotente) ────────────────────────────────────
export async function promoverAliasSeguro(analyteCode: string, alias: string, canonicalEsperada: string, actorId: number | null): Promise<boolean> {
  const cls = classificarUnidade(alias, canonicalEsperada);
  if (cls.classe !== "SAFE_ALIAS" || !cls.fator || !(cls.fator.num === 1n && cls.fator.den === 1n)) return false;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cat = await client.query(`SELECT canonical_unit FROM exam_analyte_catalog WHERE code = $1 FOR SHARE`, [analyteCode]);
    if (cat.rowCount !== 1 || normUnit(cat.rows[0].canonical_unit) !== normUnit(canonicalEsperada)) { await client.query("ROLLBACK"); return false; }
    const un = await client.query(`SELECT unit, factor_to_canonical, is_canonical FROM exam_analyte_units WHERE analyte_code = $1`, [analyteCode]);
    const canon = un.rows.filter((u: any) => u.is_canonical);
    if (canon.length !== 1 || Number(canon[0].factor_to_canonical) !== 1) { await client.query("ROLLBACK"); return false; }
    if (un.rows.some((u: any) => normUnit(u.unit) === normUnit(alias))) { await client.query("ROLLBACK"); return false; }
    await client.query(
      `INSERT INTO exam_analyte_units (analyte_code, unit, factor_to_canonical, is_canonical, active, ordem)
       VALUES ($1,$2,1,false,true,(SELECT COALESCE(MAX(ordem),0)+1 FROM exam_analyte_units WHERE analyte_code=$1))
       ON CONFLICT (analyte_code, unit) DO NOTHING`, [analyteCode, alias.slice(0, 80)]);
    await client.query(
      `INSERT INTO collaborator_audit (professional_id, action, method, path, detail) VALUES ($1,'unidade_alias_promovido','SISTEMA','exam-units',$2)`,
      [actorId, JSON.stringify({ analyteCode, alias, canonica: canonicalEsperada, fator: 1 })]);
    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally { client.release(); }
}

// ── Estados: aprovar / rejeitar ──────────────────────────────────────────────────────────────────────
export interface Ator { professionalId: number; empresaId: number; isPlatformOwner: boolean }
export type Falha = { ok: false; code: string; http: number };
export type Ok<T = object> = { ok: true } & T;

export async function aprovarPedido(id: number, ator: Ator, o: { tetoUsd?: number; ttlMin?: number; reconheceRiscoDuplicidade?: boolean } = {}): Promise<Ok<{ expiresAt: string }> | Falha> {
  if (!ator.isPlatformOwner) return { ok: false, code: "apenas_proprietario", http: 403 };
  const teto = o.tetoUsd ?? await lerNumero("exames.unidadeIA.tetoPorPedidoUsd", TETO_PADRAO_POR_PEDIDO_USD);
  if (CUSTO_ESTIMADO_POR_CONSULTA_USD > teto) return { ok: false, code: "teto_menor_que_estimativa", http: 422 };
  const ttl = Math.min(Math.max(o.ttlMin ?? TTL_PADRAO_MIN, 1), 240);
  const r = await pool.query(
    `UPDATE exam_unit_review_request
        SET status='approved', version = version + 1, approved_by=$2, approved_at=now(), decided_by=$2,
            expires_at = now() + ($3 || ' minutes')::interval, cost_cap_usd=$4, error_code=NULL,
            idempotency_key = encode(sha256((semantic_key || ':' || (version + 1))::bytea), 'hex'), updated_at=now()
      WHERE id=$1 AND ai_eligible
        AND (status IN ('pending','expired','failed') OR (status='uncertain' AND $5::boolean))
      RETURNING expires_at`,
    [id, ator.professionalId, String(ttl), teto, o.reconheceRiscoDuplicidade === true]);
  if (r.rowCount === 0) return { ok: false, code: "estado_nao_permite_aprovar", http: 409 };
  await auditar(ator.professionalId, "unidade_ia_aprovada", { pedidoId: id, tetoUsd: teto, ttlMin: ttl });
  return { ok: true, expiresAt: new Date(r.rows[0].expires_at).toISOString() };
}

export async function rejeitarPedido(id: number, ator: Ator): Promise<Ok | Falha> {
  if (!ator.isPlatformOwner) return { ok: false, code: "apenas_proprietario", http: 403 };
  const r = await pool.query(
    `UPDATE exam_unit_review_request SET status='rejected', version=version+1, decided_by=$2, updated_at=now()
      WHERE id=$1 AND status IN ('pending','approved','expired')`, [id, ator.professionalId]);
  if (r.rowCount === 0) return { ok: false, code: "estado_nao_permite_rejeitar", http: 409 };
  await auditar(ator.professionalId, "unidade_ia_rejeitada", { pedidoId: id });
  return { ok: true };
}

export async function expirarVencidos(): Promise<number> {
  const r = await pool.query(`UPDATE exam_unit_review_request SET status='expired', version=version+1, updated_at=now() WHERE status='approved' AND expires_at <= now()`);
  return r.rowCount ?? 0;
}

async function auditar(professionalId: number | null, action: string, detail: Record<string, unknown>) {
  await pool.query(`INSERT INTO collaborator_audit (professional_id, action, method, path, detail) VALUES ($1,$2,'POST','exames-lab/unidades/pedidos',$3)`, [professionalId, action, JSON.stringify(detail)]);
}

// ── Verificação determinística da resposta da IA ─────────────────────────────────────────────────────
export function verificarResposta(resp: RespostaUnidade, origem: string, destino: string): { verdict: "promovido" | "curadoria" | "rejeitado_motor"; motivo: string } {
  const cls = classificarUnidade(origem, destino);
  if (cls.classe === "SAFE_ALIAS") {
    const ok = resp.relation === "equivalent" || (resp.relation === "convertible" && resp.factor === "1");
    return ok ? { verdict: "promovido", motivo: "alias exato comprovado pelo motor dimensional" } : { verdict: "rejeitado_motor", motivo: "IA discorda de equivalência exata calculada" };
  }
  if (cls.classe === "DIMENSIONAL_CONVERSION" && cls.fator) {
    if (resp.factor) {
      const [n, d] = resp.factor.split("/");
      const fIA = rac(BigInt(n), BigInt(d ?? "1"));
      const f = cls.fator;
      if (fIA.num * f.den !== f.num * fIA.den) return { verdict: "rejeitado_motor", motivo: "fator da IA difere do exato calculado" };
    }
    return { verdict: "curadoria", motivo: "conversão dimensional exata fica para curadoria humana" };
  }
  return { verdict: "curadoria", motivo: `classe ${cls.classe}: proposta de curadoria, nada é gravado` };
}

// ── Execução: no máximo UMA chamada por autorização ──────────────────────────────────────────────────
export interface DependenciasExec { consultar?: typeof consultarOpenAIUnidade; chavePresente?: () => boolean }
export type ResultadoExec = Ok<{ status: StatusPedido; verdict: string; motivo: string; custoUsd: number }> | Falha;

export async function executarRevisao(id: number, ator: Ator, deps: DependenciasExec = {}): Promise<ResultadoExec> {
  if (!ator.isPlatformOwner) return { ok: false, code: "apenas_proprietario", http: 403 };
  const consultar = deps.consultar ?? consultarOpenAIUnidade;
  const chaveOk = (deps.chavePresente ?? chaveOpenAIPresente)();

  const cur = await pool.query(`SELECT * FROM exam_unit_review_request WHERE id=$1`, [id]);
  const p = cur.rows[0];
  if (!p) return { ok: false, code: "pedido_inexistente", http: 404 };
  if (p.status !== "approved") return { ok: false, code: "pedido_nao_aprovado", http: 409 };
  if (new Date(p.expires_at).getTime() <= Date.now()) { await expirarVencidos(); return { ok: false, code: "autorizacao_expirada", http: 409 }; }
  // 1) chave ANTES de consumir: indisponibilidade deixa o pedido aprovado e recuperável.
  if (!chaveOk) return { ok: false, code: "chave_openai_ausente", http: 503 };
  // 2) teto e quota ANTES de consumir.
  if (Number(p.cost_est_usd ?? CUSTO_ESTIMADO_POR_CONSULTA_USD) > Number(p.cost_cap_usd)) return { ok: false, code: "teto_de_custo_excedido", http: 422 };
  const limite = await lerNumero("exames.unidadeIA.limiteDiario", LIMITE_PADRAO_DIARIO);
  const usadas = await pool.query(
    `SELECT count(*)::int n FROM exam_unit_review_request WHERE empresa_id=$1 AND consumed_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'`, [p.empresa_id]);
  if (usadas.rows[0].n >= limite) return { ok: false, code: "quota_diaria_esgotada", http: 429 };

  // 3) claim atômico: só um executor passa de approved para consumed.
  const claim = await pool.query(
    `UPDATE exam_unit_review_request SET status='consumed', consumed_at=now(), version=version+1, decided_by=$2, updated_at=now()
      WHERE id=$1 AND status='approved' AND expires_at > now() RETURNING id`, [id, ator.professionalId]);
  if (claim.rowCount === 0) return { ok: false, code: "autorizacao_ja_consumida_ou_invalida", http: 409 };

  const cat = await pool.query(`SELECT display_name FROM exam_analyte_catalog WHERE code=$1`, [p.analyte_code]);
  const payload = montarPayloadUnidade({ analyteCode: p.analyte_code, analyteName: cat.rows[0]?.display_name ?? p.analyte_code, unitOrigin: p.unit_origin_raw, unitTarget: p.unit_target });
  let r: ResultadoChamada;
  try {
    r = await consultar(payload, p.empresa_id);
  } catch (e) {
    const falhou = e instanceof ProviderHttpError;
    const estado: StatusPedido = falhou ? "failed" : "uncertain";
    await pool.query(`UPDATE exam_unit_review_request SET status=$2, error_code=$3, version=version+1, updated_at=now() WHERE id=$1`, [id, estado, falhou ? `http_${(e as ProviderHttpError).status}` : "sem_resposta_confiavel"]);
    if (!falhou) void logAiUsage({ empresaId: p.empresa_id, provider: "openai", tipo: "other", custoUsd: CUSTO_ESTIMADO_POR_CONSULTA_USD });
    await auditar(ator.professionalId, "unidade_ia_consulta", { pedidoId: id, estado });
    return { ok: false, code: estado === "failed" ? "provedor_recusou" : "resultado_incerto", http: 502 };
  }
  const v = verificarResposta(r.parsed, p.unit_origin_raw, p.unit_target);
  let verdict = v.verdict;
  if (verdict === "promovido") {
    const ok = await promoverAliasSeguro(p.analyte_code, p.unit_origin_raw, p.unit_target, ator.professionalId);
    if (!ok) verdict = "curadoria";
  }
  await pool.query(`UPDATE exam_unit_review_request SET result=$2, verdict=$3, cost_real_usd=$4, version=version+1, updated_at=now() WHERE id=$1`,
    [id, JSON.stringify(r.parsed), verdict, r.custoUsd]);
  await auditar(ator.professionalId, "unidade_ia_consulta", { pedidoId: id, estado: "consumed", verdict, custoUsd: r.custoUsd });
  return { ok: true, status: "consumed", verdict, motivo: v.motivo, custoUsd: r.custoUsd };
}

export { fatorComoNumero };
