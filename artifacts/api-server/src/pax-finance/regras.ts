import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { z } from "zod";
import { registrarAuditoria } from "./auditoria";
import type { FinContext } from "./tenant";
import { ESFERAS } from "./schema";

export class FinError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data deve ser AAAA-MM-DD");
const centavos = z.number().int().nonnegative().nullable().optional();

export const RegraInput = z.object({
  ruleKey: z.string().trim().min(2).max(80),
  tributo: z.string().trim().min(1).max(60),
  esfera: z.enum(ESFERAS),
  municipio: z.string().trim().max(120).nullable().optional(),
  regime: z.string().trim().max(60).nullable().optional(),
  anexo: z.string().trim().max(20).nullable().optional(),
  cnae: z.string().trim().max(20).nullable().optional(),
  base: z.string().trim().max(120).nullable().optional(),
  aliquotaPct: z.number().min(0).max(100).nullable().optional(),
  parcelaDeduzirCents: centavos,
  limiteMinCents: centavos,
  limiteMaxCents: centavos,
  params: z.record(z.unknown()).optional(),
  fonteOficial: z.string().trim().max(200).nullable().optional(),
  fonteUrl: z.string().trim().url().max(500).nullable().optional(),
  fonteConsultadaEm: data.nullable().optional(),
  vigenciaInicio: data,
  vigenciaFim: data.nullable().optional(),
});
export type RegraInputT = z.infer<typeof RegraInput>;

const COLS = sql`id, company_id, rule_key, version, tributo, esfera, municipio, regime, anexo, cnae, base, aliquota_pct, parcela_deduzir_cents,
  limite_min_cents, limite_max_cents, params, fonte_oficial, fonte_url, fonte_consultada_em, vigencia_inicio, vigencia_fim, status,
  responsavel_id, aprovador_id, aprovado_em, created_at, updated_at`;

type Row = Record<string, unknown>;
export function paraApi(r: Row) {
  return {
    id: Number(r.id), ruleKey: r.rule_key, version: Number(r.version), tributo: r.tributo, esfera: r.esfera, municipio: r.municipio ?? null,
    regime: r.regime ?? null, anexo: r.anexo ?? null, cnae: r.cnae ?? null, base: r.base ?? null,
    aliquotaPct: r.aliquota_pct === null || r.aliquota_pct === undefined ? null : Number(r.aliquota_pct),
    parcelaDeduzirCents: r.parcela_deduzir_cents == null ? null : Number(r.parcela_deduzir_cents),
    limiteMinCents: r.limite_min_cents == null ? null : Number(r.limite_min_cents),
    limiteMaxCents: r.limite_max_cents == null ? null : Number(r.limite_max_cents),
    params: r.params ?? {}, fonteOficial: r.fonte_oficial ?? null, fonteUrl: r.fonte_url ?? null,
    fonteConsultadaEm: r.fonte_consultada_em ? String(r.fonte_consultada_em).slice(0, 10) : null,
    vigenciaInicio: String(r.vigencia_inicio).slice(0, 10), vigenciaFim: r.vigencia_fim ? String(r.vigencia_fim).slice(0, 10) : null,
    status: r.status, responsavelId: r.responsavel_id ?? null, aprovadorId: r.aprovador_id ?? null,
    aprovadoEm: r.aprovado_em ? new Date(r.aprovado_em as string).toISOString() : null,
  };
}

export async function listarRegras(ctx: FinContext, filtro: { status?: string; tributo?: string }) {
  const st = filtro.status ? sql`AND status = ${filtro.status}` : sql``;
  const tr = filtro.tributo ? sql`AND tributo = ${filtro.tributo}` : sql``;
  const r = await db.execute(sql`SELECT ${COLS} FROM fin_tax_rule WHERE company_id = ${ctx.companyId} ${st} ${tr} ORDER BY rule_key, version DESC`);
  return (r.rows as Row[]).map(paraApi);
}

type Exec = { execute: (q: ReturnType<typeof sql>) => Promise<{ rows: unknown[] }> };
async function carregar(tx: Exec, ctx: FinContext, id: number, travar = false): Promise<Row> {
  const lock = travar ? sql`FOR UPDATE` : sql``;
  const r = await tx.execute(sql`SELECT ${COLS} FROM fin_tax_rule WHERE id = ${id} AND company_id = ${ctx.companyId} ${lock}`);
  const row = (r.rows as Row[])[0];
  if (!row) throw new FinError(404, "Regra nao encontrada");
  return row;
}

export async function obterRegra(ctx: FinContext, id: number) {
  const row = await carregar(db, ctx, id);
  const hist = await db.execute(sql`SELECT ${COLS} FROM fin_tax_rule WHERE company_id = ${ctx.companyId} AND rule_key = ${row.rule_key as string} ORDER BY version DESC`);
  return { regra: paraApi(row), historico: (hist.rows as Row[]).map(paraApi) };
}

/** Cria rascunho. Chave nova começa na versão 1; chave existente gera a próxima versão (nunca altera a aprovada). */
export async function criarRascunho(ctx: FinContext, input: RegraInputT) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${ctx.companyId}, hashtext(${input.ruleKey}))`);
    const ult = (await tx.execute(sql`SELECT COALESCE(MAX(version),0)::int AS v FROM fin_tax_rule WHERE company_id = ${ctx.companyId} AND rule_key = ${input.ruleKey}`)).rows[0] as { v: number };
    const aberto = (await tx.execute(sql`SELECT 1 FROM fin_tax_rule WHERE company_id = ${ctx.companyId} AND rule_key = ${input.ruleKey} AND status IN ('rascunho','pendente') LIMIT 1`)).rows[0];
    if (aberto) throw new FinError(409, "Ja existe uma versao em rascunho ou pendente para esta regra");
    const r = await tx.execute(sql`INSERT INTO fin_tax_rule (company_id, rule_key, version, tributo, esfera, municipio, regime, anexo, cnae, base,
      aliquota_pct, parcela_deduzir_cents, limite_min_cents, limite_max_cents, params, fonte_oficial, fonte_url, fonte_consultada_em,
      vigencia_inicio, vigencia_fim, responsavel_id)
      VALUES (${ctx.companyId}, ${input.ruleKey}, ${ult.v + 1}, ${input.tributo}, ${input.esfera}, ${input.municipio ?? null}, ${input.regime ?? null},
      ${input.anexo ?? null}, ${input.cnae ?? null}, ${input.base ?? null}, ${input.aliquotaPct ?? null}, ${input.parcelaDeduzirCents ?? null},
      ${input.limiteMinCents ?? null}, ${input.limiteMaxCents ?? null}, ${JSON.stringify(input.params ?? {})}::jsonb, ${input.fonteOficial ?? null},
      ${input.fonteUrl ?? null}, ${input.fonteConsultadaEm ?? null}, ${input.vigenciaInicio}, ${input.vigenciaFim ?? null}, ${ctx.actorId})
      RETURNING ${COLS}`);
    const row = (r.rows as Row[])[0];
    await registrarAuditoria(tx, ctx, "regra.criar_rascunho", "fin_tax_rule", Number(row.id), { ruleKey: input.ruleKey, version: ult.v + 1 });
    return paraApi(row);
  });
}

export async function editarRascunho(ctx: FinContext, id: number, input: RegraInputT) {
  return db.transaction(async (tx) => {
    const atual = await carregar(tx, ctx, id, true);
    if (atual.status !== "rascunho") throw new FinError(409, "So rascunho pode ser editado; regra aprovada exige nova versao");
    if (input.ruleKey !== atual.rule_key) throw new FinError(400, "A chave da regra nao pode mudar");
    const r = await tx.execute(sql`UPDATE fin_tax_rule SET tributo=${input.tributo}, esfera=${input.esfera}, municipio=${input.municipio ?? null},
      regime=${input.regime ?? null}, anexo=${input.anexo ?? null}, cnae=${input.cnae ?? null}, base=${input.base ?? null},
      aliquota_pct=${input.aliquotaPct ?? null}, parcela_deduzir_cents=${input.parcelaDeduzirCents ?? null}, limite_min_cents=${input.limiteMinCents ?? null},
      limite_max_cents=${input.limiteMaxCents ?? null}, params=${JSON.stringify(input.params ?? {})}::jsonb, fonte_oficial=${input.fonteOficial ?? null},
      fonte_url=${input.fonteUrl ?? null}, fonte_consultada_em=${input.fonteConsultadaEm ?? null}, vigencia_inicio=${input.vigenciaInicio},
      vigencia_fim=${input.vigenciaFim ?? null}, updated_at=now() WHERE id=${id} AND company_id=${ctx.companyId} RETURNING ${COLS}`);
    await registrarAuditoria(tx, ctx, "regra.editar_rascunho", "fin_tax_rule", id, { version: atual.version });
    return paraApi((r.rows as Row[])[0]);
  });
}

export async function enviarParaAprovacao(ctx: FinContext, id: number) {
  return db.transaction(async (tx) => {
    const atual = await carregar(tx, ctx, id, true);
    if (atual.status !== "rascunho") throw new FinError(409, "Somente rascunho pode ser enviado para aprovacao");
    const r = await tx.execute(sql`UPDATE fin_tax_rule SET status='pendente', updated_at=now() WHERE id=${id} AND company_id=${ctx.companyId} RETURNING ${COLS}`);
    await registrarAuditoria(tx, ctx, "regra.enviar_aprovacao", "fin_tax_rule", id, {});
    return paraApi((r.rows as Row[])[0]);
  });
}

export async function aprovar(ctx: FinContext, id: number) {
  if (!ctx.actorId) throw new FinError(403, "Aprovador nao identificado");
  return db.transaction(async (tx) => {
    const a = await carregar(tx, ctx, id, true);
    if (a.status !== "pendente") throw new FinError(409, "Somente regra pendente pode ser aprovada");
    const faltas: string[] = [];
    if (!a.fonte_oficial) faltas.push("fonte oficial");
    if (!a.fonte_url) faltas.push("endereco (URL) da fonte");
    if (!a.fonte_consultada_em) faltas.push("data de consulta da fonte");
    if (faltas.length) throw new FinError(422, `Aprovacao exige registro da fonte: falta ${faltas.join(", ")}`);
    const r = await tx.execute(sql`UPDATE fin_tax_rule SET status='aprovada', aprovador_id=${ctx.actorId}, aprovado_em=now(), updated_at=now()
      WHERE id=${id} AND company_id=${ctx.companyId} RETURNING ${COLS}`);
    await registrarAuditoria(tx, ctx, "regra.aprovar", "fin_tax_rule", id, { fonteUrl: a.fonte_url });
    return paraApi((r.rows as Row[])[0]);
  });
}

/** Ativa a versão aprovada e marca a anterior como substituída (vigência encerrada no dia anterior). */
export async function ativar(ctx: FinContext, id: number) {
  return db.transaction(async (tx) => {
    const a = await carregar(tx, ctx, id, true);
    if (a.status !== "aprovada") throw new FinError(409, "Somente regra aprovada pode ser ativada");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${ctx.companyId}, hashtext(${a.rule_key as string}))`);
    await tx.execute(sql`UPDATE fin_tax_rule SET status='substituida', updated_at=now(),
        vigencia_fim = CASE WHEN vigencia_fim IS NULL OR vigencia_fim >= ${String(a.vigencia_inicio).slice(0, 10)}::date
                            THEN (${String(a.vigencia_inicio).slice(0, 10)}::date - 1) ELSE vigencia_fim END
      WHERE company_id=${ctx.companyId} AND rule_key=${a.rule_key as string} AND status='ativa' AND id <> ${id}
        AND vigencia_inicio < ${String(a.vigencia_inicio).slice(0, 10)}::date`);
    const conflito = (await tx.execute(sql`SELECT 1 FROM fin_tax_rule WHERE company_id=${ctx.companyId} AND rule_key=${a.rule_key as string} AND status='ativa' AND id <> ${id} LIMIT 1`)).rows[0];
    if (conflito) throw new FinError(409, "Existe regra ativa com vigencia igual ou posterior; ajuste a vigencia da nova versao");
    const r = await tx.execute(sql`UPDATE fin_tax_rule SET status='ativa', updated_at=now() WHERE id=${id} AND company_id=${ctx.companyId} RETURNING ${COLS}`);
    await registrarAuditoria(tx, ctx, "regra.ativar", "fin_tax_rule", id, { version: a.version });
    return paraApi((r.rows as Row[])[0]);
  });
}

/** Regra oficial vigente numa data: ativa, ou substituida cuja vigencia cobre a data (recalculo historico). Rascunho ou pendente nunca entra em cálculo oficial. */
export async function regraVigente(ctx: FinContext, ruleKey: string, dia: string) {
  const r = await db.execute(sql`SELECT ${COLS} FROM fin_tax_rule WHERE company_id=${ctx.companyId} AND rule_key=${ruleKey} AND status IN ('ativa','substituida')
    AND vigencia_inicio <= ${dia}::date AND (vigencia_fim IS NULL OR vigencia_fim >= ${dia}::date) ORDER BY version DESC LIMIT 1`);
  const row = (r.rows as Row[])[0];
  return row ? paraApi(row) : null;
}
