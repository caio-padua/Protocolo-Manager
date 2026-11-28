import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { z } from "zod";
import { brtISODate } from "../lib/brt";
import { registrarAuditoria } from "./auditoria";
import { FinError } from "./regras";
import { PERIOD_TYPES, chaveAtual, janela, resumir, type PeriodType } from "./goals-calc";
import type { FinContext } from "./tenant";

type Row = Record<string, unknown>;
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const MetaInput = z.object({
  tipo: z.enum(["faturamento", "credito"]), periodType: z.enum(PERIOD_TYPES as [PeriodType, ...PeriodType[]]), periodKey: z.string().trim().min(4).max(20),
  targetCents: z.number().int().positive(), titulo: z.string().trim().max(160).nullable().optional(), note: z.string().trim().max(1000).nullable().optional(),
});
export const MarcoInput = z.object({ ordem: z.number().int().min(1).max(4), nome: z.string().trim().min(2).max(80), valorMensalCents: z.number().int().positive(), note: z.string().trim().max(400).nullable().optional() });
export const CreditoInput = z.object({
  nome: z.string().trim().min(2).max(120),
  etapa: z.enum(["meta_interna", "requisito_preliminar", "simulacao", "pre_analise_bancaria", "aprovacao_formal"]),
  conditions: z.object({
    elegibilidade: z.string().max(600).nullable().optional(), requisitos: z.string().max(800).nullable().optional(),
    tempoCnpjMeses: z.number().int().nonnegative().nullable().optional(), faturamentoExigidoCents: z.number().int().nonnegative().nullable().optional(),
    percentualTeto: z.string().max(200).nullable().optional(), juros: z.string().max(200).nullable().optional(), prazo: z.string().max(200).nullable().optional(),
    carencia: z.string().max(200).nullable().optional(), garantias: z.string().max(400).nullable().optional(), documentos: z.string().max(800).nullable().optional(),
  }),
  fonteOficial: z.string().trim().max(200).nullable().optional(), fonteUrl: z.string().trim().url().max(500).nullable().optional(), verificadaEm: data.nullable().optional(),
});

/** Nomes das linhas a verificar. Nenhuma condicao numerica e inventada: tudo nasce "Aguardando verificacao". */
export const LINHAS_CREDITO: { key: string; nome: string }[] = [
  { key: "pronampe", nome: "Pronampe" }, { key: "procred360", nome: "ProCred 360" }, { key: "bndes", nome: "BNDES Crédito Pequenas Empresas" }, { key: "cartao_bndes", nome: "Cartão BNDES" }, { key: "finame", nome: "BNDES Finame (equipamentos)" },
  { key: "desenvolve_sp", nome: "Desenvolve SP" }, { key: "fgi_peac", nome: "FGI / PEAC" }, { key: "cooperativas", nome: "Cooperativas (Sicoob / Unicred)" },
];

export async function listarMetas(ctx: FinContext) {
  const r = await db.execute(sql`SELECT * FROM fin_goal WHERE company_id=${ctx.companyId} ORDER BY period_key DESC, id DESC`);
  return (r.rows as Row[]).map((g) => ({ id: Number(g.id), tipo: g.tipo, periodType: g.period_type, periodKey: g.period_key, targetCents: Number(g.target_cents), titulo: g.titulo ?? null, note: g.note ?? null }));
}
export async function salvarMeta(ctx: FinContext, i: z.infer<typeof MetaInput>) {
  if (!janela(i.periodType, i.periodKey, brtISODate())) throw new FinError(400, "Chave do periodo nao combina com o tipo escolhido");
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`INSERT INTO fin_goal (company_id, tipo, period_type, period_key, target_cents, titulo, note)
      VALUES (${ctx.companyId}, ${i.tipo}, ${i.periodType}, ${i.periodKey}, ${i.targetCents}, ${i.titulo ?? null}, ${i.note ?? null})
      ON CONFLICT (company_id, tipo, period_type, period_key) DO UPDATE SET target_cents=EXCLUDED.target_cents, titulo=EXCLUDED.titulo, note=EXCLUDED.note, updated_at=now() RETURNING id`);
    const id = Number((r.rows as Row[])[0].id);
    await registrarAuditoria(tx, ctx, "meta.salvar", "fin_goal", id, { tipo: i.tipo, periodType: i.periodType, periodKey: i.periodKey, targetCents: i.targetCents });
    return { id };
  });
}
export async function apagarMeta(ctx: FinContext, id: number) {
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`DELETE FROM fin_goal WHERE id=${id} AND company_id=${ctx.companyId} RETURNING id`);
    if (!(r.rows as Row[])[0]) throw new FinError(404, "Meta nao encontrada");
    await registrarAuditoria(tx, ctx, "meta.remover", "fin_goal", id, {});
    return { ok: true };
  });
}

export async function listarMarcos(ctx: FinContext) {
  const r = await db.execute(sql`SELECT * FROM fin_goal_milestone WHERE company_id=${ctx.companyId} ORDER BY ordem`);
  return (r.rows as Row[]).map((m) => ({ ordem: Number(m.ordem), nome: m.nome, valorMensalCents: Number(m.valor_mensal_cents), note: m.note ?? null }));
}
export async function salvarMarco(ctx: FinContext, i: z.infer<typeof MarcoInput>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`INSERT INTO fin_goal_milestone (company_id, ordem, nome, valor_mensal_cents, note) VALUES (${ctx.companyId}, ${i.ordem}, ${i.nome}, ${i.valorMensalCents}, ${i.note ?? null})
      ON CONFLICT (company_id, ordem) DO UPDATE SET nome=EXCLUDED.nome, valor_mensal_cents=EXCLUDED.valor_mensal_cents, note=EXCLUDED.note, updated_at=now()`);
    await registrarAuditoria(tx, ctx, "marco.salvar", "fin_goal_milestone", i.ordem, { valorMensalCents: i.valorMensalCents });
    return { ok: true };
  });
}

const creditoApi = (c: Row) => ({
  lineKey: c.line_key, version: Number(c.version), nome: c.nome, etapa: c.etapa, conditions: c.conditions ?? {}, status: c.status,
  fonteOficial: c.fonte_oficial ?? null, fonteUrl: c.fonte_url ?? null, verificadaEm: c.verificada_em ? String(c.verificada_em).slice(0, 10) : null,
});
/** Ultima versao de cada linha. */
export async function listarCredito(ctx: FinContext) {
  const r = await db.execute(sql`SELECT DISTINCT ON (line_key) * FROM fin_credit_line WHERE company_id=${ctx.companyId} ORDER BY line_key, version DESC`);
  return (r.rows as Row[]).map(creditoApi);
}
export async function semearCredito(ctx: FinContext) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${ctx.companyId}, hashtext('credito-semente'))`);
    let n = 0;
    for (const l of LINHAS_CREDITO) {
      const ex = (await tx.execute(sql`SELECT 1 FROM fin_credit_line WHERE company_id=${ctx.companyId} AND line_key=${l.key}`)).rows[0];
      if (ex) continue;
      await tx.execute(sql`INSERT INTO fin_credit_line (company_id, line_key, version, nome, created_by) VALUES (${ctx.companyId}, ${l.key}, 1, ${l.nome}, ${ctx.actorId})`);
      n++;
    }
    if (n) await registrarAuditoria(tx, ctx, "credito.semear", "fin_credit_line", null, { linhas: n });
    return { criadas: n };
  });
}
/** Edicao gera NOVA versao (historico preservado). So vira "verificada" com fonte oficial, URL e data. */
export async function novaVersaoCredito(ctx: FinContext, lineKey: string, i: z.infer<typeof CreditoInput>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${ctx.companyId}, hashtext(${lineKey}))`);
    const ult = (await tx.execute(sql`SELECT COALESCE(MAX(version),0)::int AS v FROM fin_credit_line WHERE company_id=${ctx.companyId} AND line_key=${lineKey}`)).rows[0] as { v: number };
    if (!ult.v) throw new FinError(404, "Linha de credito nao encontrada");
    const completo = !!(i.fonteOficial && i.fonteUrl && i.verificadaEm);
    const r = await tx.execute(sql`INSERT INTO fin_credit_line (company_id, line_key, version, nome, etapa, conditions, status, fonte_oficial, fonte_url, verificada_em, created_by)
      VALUES (${ctx.companyId}, ${lineKey}, ${ult.v + 1}, ${i.nome}, ${i.etapa}, ${JSON.stringify(i.conditions)}::jsonb, ${completo ? "verificada" : "aguardando_verificacao"},
      ${i.fonteOficial ?? null}, ${i.fonteUrl ?? null}, ${i.verificadaEm ?? null}, ${ctx.actorId}) RETURNING *`);
    await registrarAuditoria(tx, ctx, "credito.nova_versao", "fin_credit_line", null, { lineKey, version: ult.v + 1, verificada: completo });
    return creditoApi((r.rows as Row[])[0]);
  });
}

/** Leitura SOMENTE LEITURA dos pagamentos da empresa da sessao (Asaas/locais). Nao altera cobranca. Valores em reais -> centavos. */
async function lerPagamentos(ctx: FinContext) {
  const r = await db.execute(sql`SELECT amount, status, paid_at, due_date, created_at, provider, asaas_invoice_url FROM payments WHERE empresa_id=${ctx.companyId}`);
  return r.rows as Row[];
}
const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const mes = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}/.test(v) ? v.slice(0, 7) : null);

export async function resumoGoals(ctx: FinContext, periodType: PeriodType, periodKeyIn?: string) {
  const hoje = brtISODate();
  const periodKey = periodKeyIn ?? chaveAtual(periodType, hoje);
  const j = janela(periodType, periodKey, hoje);
  if (!j) throw new FinError(400, "Chave do periodo nao combina com o tipo escolhido");
  const pag = await lerPagamentos(ctx);
  const recebido = new Map<string, number>(), aberto = new Map<string, number>(), vencido = new Map<string, number>();
  let comNota = 0;
  for (const p of pag) {
    const v = cents(p.amount);
    if (p.status === "paid") { const m = mes(p.paid_at) ?? mes(p.created_at); if (m) recebido.set(m, (recebido.get(m) ?? 0) + v); if (p.asaas_invoice_url) comNota++; }
    else if (p.status === "overdue") { const m = mes(p.due_date) ?? mes(p.created_at); if (m) vencido.set(m, (vencido.get(m) ?? 0) + v); }
    else if (p.status === "pending") { const m = mes(p.due_date) ?? mes(p.created_at); if (m) aberto.set(m, (aberto.get(m) ?? 0) + v); }
  }
  const lanc = await db.execute(sql`SELECT to_char(competencia,'YYYY-MM') AS m, COALESCE(SUM(valor_cents),0)::bigint AS s, COUNT(*)::int AS n FROM fin_ledger_entry
    WHERE company_id=${ctx.companyId} AND tipo='receita' AND status <> 'cancelado' GROUP BY 1`);
  const lancMap = new Map((lanc.rows as Row[]).map((x) => [String(x.m), Number(x.s)]));
  const mesesSerie = j.meses;
  const atual = hoje.slice(0, 7);
  const serie = mesesSerie.map((m) => ({ mes: m, recebidoCents: recebido.get(m) ?? 0, abertoCents: aberto.get(m) ?? 0, vencidoCents: vencido.get(m) ?? 0, futuro: m > atual }));
  const soma = (mp: Map<string, number>) => j.meses.reduce((a, m) => a + (mp.get(m) ?? 0), 0);
  const metaRow = (await db.execute(sql`SELECT target_cents FROM fin_goal WHERE company_id=${ctx.companyId} AND tipo='faturamento' AND period_type=${periodType} AND period_key=${periodKey}`)).rows[0] as Row | undefined;
  const recebidoTotal = soma(recebido);
  const reconhecido = j.meses.some((m) => lancMap.has(m)) ? j.meses.reduce((a, m) => a + (lancMap.get(m) ?? 0), 0) : null;
  const legado = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM fin_legacy_goal WHERE status='legado_nao_atribuido'`)).rows[0] as Row;
  return {
    periodType, periodKey, janela: { meses: j.meses, decorridos: j.decorridos, total: j.total },
    resumo: resumir(metaRow ? Number(metaRow.target_cents) : null, recebidoTotal, j),
    conceitos: {
      recebidoCents: recebidoTotal, abertoCents: soma(aberto), vencidoCents: soma(vencido),
      emitidoCents: null as number | null, emitidoNota: "Sem fonte de notas fiscais conectada: o numero de notas emitidas ainda nao e confiavel.",
      reconhecidoCents: reconhecido, pagamentosComLinkDeNota: comNota,
    },
    serie, origem: "payments (leitura, empresa da sessao) + fin_ledger_entry",
    legadoNaoAtribuido: Number(legado.n),
  };
}
