import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { z } from "zod";
import { registrarAuditoria } from "./auditoria";
import { FinError } from "./regras";
import type { FinContext } from "./tenant";

type Row = Record<string, unknown>;
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const LancInput = z.object({
  tipo: z.enum(["receita", "despesa", "guia"]), descricao: z.string().trim().min(2).max(200), valorCents: z.number().int().positive(),
  competencia: dia, dataCaixa: dia.nullable().optional(), status: z.enum(["previsto", "realizado"]).default("previsto"), entityId: z.number().int().positive().nullable().optional(),
}).refine((v) => v.status !== "realizado" || !!v.dataCaixa, { message: "Lancamento realizado exige a data de caixa", path: ["dataCaixa"] });

const api = (r: Row) => ({
  id: Number(r.id), tipo: r.tipo, descricao: r.descricao, valorCents: Number(r.valor_cents), competencia: String(r.competencia).slice(0, 10),
  dataCaixa: r.data_caixa ? String(r.data_caixa).slice(0, 10) : null, status: r.status, origem: r.origem, entityId: r.entity_id == null ? null : Number(r.entity_id),
});

export async function criarLancamento(ctx: FinContext, i: z.infer<typeof LancInput>) {
  return db.transaction(async (tx) => {
    if (i.entityId) { const ok = (await tx.execute(sql`SELECT 1 FROM fin_entity WHERE id=${i.entityId} AND company_id=${ctx.companyId}`)).rows[0]; if (!ok) throw new FinError(404, "CNPJ nao encontrado"); }
    const r = await tx.execute(sql`INSERT INTO fin_ledger_entry (company_id, entity_id, tipo, descricao, valor_cents, competencia, data_caixa, status, created_by)
      VALUES (${ctx.companyId}, ${i.entityId ?? null}, ${i.tipo}, ${i.descricao}, ${i.valorCents}, ${i.competencia}, ${i.dataCaixa ?? null}, ${i.status}, ${ctx.actorId}) RETURNING *`);
    const row = (r.rows as Row[])[0];
    await registrarAuditoria(tx, ctx, "lancamento.criar", "fin_ledger_entry", Number(row.id), { tipo: i.tipo, valorCents: i.valorCents });
    return api(row);
  });
}
/** Nao ha exclusao: cancelar preserva a linha e a trilha. */
export async function cancelarLancamento(ctx: FinContext, id: number) {
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`UPDATE fin_ledger_entry SET status='cancelado' WHERE id=${id} AND company_id=${ctx.companyId} RETURNING *`);
    const row = (r.rows as Row[])[0];
    if (!row) throw new FinError(404, "Lancamento nao encontrado");
    await registrarAuditoria(tx, ctx, "lancamento.cancelar", "fin_ledger_entry", id, {});
    return api(row);
  });
}

/** Livro-caixa gerencial: lancamentos proprios + pagamentos da empresa em leitura (idempotencia pela referencia payments:<id>). */
export async function livroCaixa(ctx: FinContext) {
  const l = ((await db.execute(sql`SELECT * FROM fin_ledger_entry WHERE company_id=${ctx.companyId} ORDER BY competencia DESC, id DESC LIMIT 500`)).rows as Row[]).map(api);
  const p = (await db.execute(sql`SELECT id, amount, status, paid_at, due_date, created_at, provider FROM payments WHERE empresa_id=${ctx.companyId} ORDER BY id DESC LIMIT 500`)).rows as Row[];
  const pagamentos = p.map((x) => ({
    referencia: `payments:${x.id}`, origem: x.provider ? String(x.provider) : "local", valorCents: Math.round(Number(x.amount ?? 0) * 100),
    estado: x.status === "paid" ? "recebido" : x.status === "overdue" ? "vencido" : x.status === "pending" ? "a_receber" : String(x.status),
    data: String((x.paid_at as string) ?? (x.due_date as string) ?? (x.created_at as string) ?? "").slice(0, 10) || null,
  }));
  const soma = (f: (x: ReturnType<typeof api>) => boolean) => l.filter(f).reduce((a, x) => a + x.valorCents, 0);
  const recebidoPag = pagamentos.filter((x) => x.estado === "recebido").reduce((a, x) => a + x.valorCents, 0);
  const aReceber = pagamentos.filter((x) => x.estado === "a_receber" || x.estado === "vencido").reduce((a, x) => a + x.valorCents, 0);
  const despesasPagas = soma((x) => x.tipo === "despesa" && x.status === "realizado");
  const guiasPagas = soma((x) => x.tipo === "guia" && x.status === "realizado");
  const receitasManuais = soma((x) => x.tipo === "receita" && x.status === "realizado");
  return {
    lancamentos: l, pagamentos,
    totais: {
      recebidoPagamentosCents: recebidoPag, receitasManuaisCents: receitasManuais, aReceberCents: aReceber, despesasPagasCents: despesasPagas, guiasPagasCents: guiasPagas,
      aPagarCents: soma((x) => (x.tipo === "despesa" || x.tipo === "guia") && x.status === "previsto"),
      caixaLiquidoCents: recebidoPag + receitasManuais - despesasPagas - guiasPagas,
    },
    modo: "leitura dos pagamentos; nenhuma cobranca, transferencia ou nota e alterada",
  };
}
