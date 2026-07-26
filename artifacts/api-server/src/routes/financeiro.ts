import { Router, type IRouter } from "express";
import { moduleGuard } from "../middleware/moduleGuard";
import { eq, and } from "drizzle-orm";
import { db, paymentsTable, clientsTable, financialGoalsTable } from "@workspace/db";
import {
  GetReconciliationQueryParams,
  ListFinancialGoalsQueryParams,
  UpsertFinancialGoalBody,
  DeleteFinancialGoalParams,
  GetFinancialGoalsSummaryQueryParams,
} from "@workspace/api-zod";
import { requireCollaborator } from "./collaborator";
import { asaasListCharges } from "../lib/asaas";

// ===========================================================================
// FINANCEIRO — Conciliacao (Asaas x payments locais) e Metas & Crescimento.
// Tudo data-driven. TODA rota exige requireCollaborator.
// ===========================================================================

const router: IRouter = Router();
router.use(moduleGuard("financeiro"));

// Status do Asaas que contam como "pago/recebido".
const ASAAS_PAID = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
// Status local que contam como "pago".
const LOCAL_PAID = new Set(["paid", "received", "confirmed", "pago"]);

function localIsPaid(status: string): boolean {
  return LOCAL_PAID.has(status.toLowerCase());
}

// --------------------------------------------------------- CONCILIACAO -------
router.get("/reconciliation", requireCollaborator, async (req, res): Promise<void> => {
  const parsed = GetReconciliationQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Parametros invalidos", details: parsed.error.issues });
    return;
  }
  // Clamp: offset nunca negativo; limit entre 1 e 200 (teto contra slice inconsistente / abuso).
  const offset = Math.max(0, Math.trunc(parsed.data.offset ?? 0));
  const limit = Math.min(200, Math.max(1, Math.trunc(parsed.data.limit ?? 50)));

  let remote: Awaited<ReturnType<typeof asaasListCharges>> = [];
  try {
    remote = await asaasListCharges();
  } catch (e) {
    res.status(502).json({
      error: "Nao foi possivel consultar o Asaas. Confira a chave em Configuracoes > Portas de Pagamento.",
      detail: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  const localRows = await db
    .select({
      id: paymentsTable.id,
      amount: paymentsTable.amount,
      status: paymentsTable.status,
      asaasChargeId: paymentsTable.asaasChargeId,
      invoiceUrl: paymentsTable.asaasInvoiceUrl,
      dueDate: paymentsTable.dueDate,
      clientId: paymentsTable.clientId,
    })
    .from(paymentsTable);

  const clientIds = [...new Set(localRows.map((r) => r.clientId).filter((x): x is number => x != null))];
  const clientNameById = new Map<number, string>();
  if (clientIds.length) {
    const cs = await db
      .select({ id: clientsTable.id, name: clientsTable.name })
      .from(clientsTable);
    for (const c of cs) clientNameById.set(c.id, c.name);
  }

  const localByCharge = new Map<string, (typeof localRows)[number]>();
  for (const r of localRows) {
    if (r.asaasChargeId) localByCharge.set(r.asaasChargeId, r);
  }

  type Item = {
    asaasChargeId: string | null;
    paymentId: number | null;
    clientName: string | null;
    asaasStatus: string | null;
    localStatus: string | null;
    asaasValue: number | null;
    localAmount: number | null;
    invoiceUrl: string | null;
    dueDate: string | null;
    match: "ok" | "missing_local" | "missing_remote" | "status_mismatch" | "value_mismatch";
  };

  const items: Item[] = [];
  const remoteIds = new Set<string>();

  for (const ch of remote) {
    remoteIds.add(ch.id);
    const local = localByCharge.get(ch.id);
    if (!local) {
      items.push({
        asaasChargeId: ch.id,
        paymentId: null,
        clientName: null,
        asaasStatus: ch.status,
        localStatus: null,
        asaasValue: ch.value,
        localAmount: null,
        invoiceUrl: ch.invoiceUrl,
        dueDate: ch.dueDate,
        match: "missing_local",
      });
      continue;
    }
    const clientName = local.clientId != null ? clientNameById.get(local.clientId) ?? null : null;
    let match: Item["match"] = "ok";
    if (Math.abs((local.amount ?? 0) - ch.value) > 0.01) {
      match = "value_mismatch";
    } else {
      const remotePaid = ASAAS_PAID.has(ch.status);
      const locPaid = localIsPaid(local.status);
      if (remotePaid !== locPaid) match = "status_mismatch";
    }
    items.push({
      asaasChargeId: ch.id,
      paymentId: local.id,
      clientName,
      asaasStatus: ch.status,
      localStatus: local.status,
      asaasValue: ch.value,
      localAmount: local.amount,
      invoiceUrl: local.invoiceUrl ?? ch.invoiceUrl,
      dueDate: local.dueDate ?? ch.dueDate,
      match,
    });
  }

  // Locais com asaasChargeId que o Asaas nao retornou (fora da janela) = sobra.
  for (const r of localRows) {
    if (r.asaasChargeId && !remoteIds.has(r.asaasChargeId)) {
      items.push({
        asaasChargeId: r.asaasChargeId,
        paymentId: r.id,
        clientName: r.clientId != null ? clientNameById.get(r.clientId) ?? null : null,
        asaasStatus: null,
        localStatus: r.status,
        asaasValue: null,
        localAmount: r.amount,
        invoiceUrl: r.invoiceUrl,
        dueDate: r.dueDate,
        match: "missing_remote",
      });
    }
  }

  const summary = {
    total: items.length,
    ok: items.filter((i) => i.match === "ok").length,
    missingLocal: items.filter((i) => i.match === "missing_local").length,
    missingRemote: items.filter((i) => i.match === "missing_remote").length,
    statusMismatch: items.filter((i) => i.match === "status_mismatch").length,
    valueMismatch: items.filter((i) => i.match === "value_mismatch").length,
  };

  // Ordena por gravidade (divergencias primeiro), depois pagina.
  const order: Record<Item["match"], number> = {
    value_mismatch: 0,
    status_mismatch: 1,
    missing_local: 2,
    missing_remote: 3,
    ok: 4,
  };
  items.sort((a, b) => order[a.match] - order[b.match]);

  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + limit;
  res.json({
    items: page,
    summary,
    hasMore: nextOffset < items.length,
    nextOffset: nextOffset < items.length ? nextOffset : null,
  });
});

// --------------------------------------------------------- METAS -------------
// Limites [inicio, fimExclusivo) de um periodo, em datas YYYY-MM-DD (string).
function periodBounds(periodType: string, periodKey: string): { start: string; end: string } | null {
  if (periodType === "month") {
    const m = periodKey.match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const start = `${m[1]}-${m[2]}-01`;
    const nextY = mo === 12 ? y + 1 : y;
    const nextMo = mo === 12 ? 1 : mo + 1;
    const end = `${nextY}-${String(nextMo).padStart(2, "0")}-01`;
    return { start, end };
  }
  if (periodType === "semester") {
    const m = periodKey.match(/^(\d{4})-S([12])$/);
    if (!m) return null;
    const y = Number(m[1]);
    if (m[2] === "1") return { start: `${y}-01-01`, end: `${y}-07-01` };
    return { start: `${y}-07-01`, end: `${y + 1}-01-01` };
  }
  if (periodType === "year") {
    const m = periodKey.match(/^(\d{4})$/);
    if (!m) return null;
    const y = Number(m[1]);
    return { start: `${y}-01-01`, end: `${y + 1}-01-01` };
  }
  return null;
}

// Realizado = soma dos pagamentos pagos cuja data de pagamento cai no periodo.
async function realizadoFor(periodType: string, periodKey: string): Promise<number> {
  const b = periodBounds(periodType, periodKey);
  if (!b) return 0;
  const rows = await db
    .select({ amount: paymentsTable.amount, status: paymentsTable.status, paidAt: paymentsTable.paidAt })
    .from(paymentsTable);
  let sum = 0;
  for (const r of rows) {
    if (!localIsPaid(r.status)) continue;
    const d = (r.paidAt ?? "").slice(0, 10);
    if (!d) continue;
    if (d >= b.start && d < b.end) sum += r.amount ?? 0;
  }
  return Math.round(sum * 100) / 100;
}

router.get("/financial-goals", requireCollaborator, async (req, res): Promise<void> => {
  const parsed = ListFinancialGoalsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Parametros invalidos", details: parsed.error.issues });
    return;
  }
  const rows = parsed.data.periodType
    ? await db.select().from(financialGoalsTable).where(eq(financialGoalsTable.periodType, parsed.data.periodType))
    : await db.select().from(financialGoalsTable);

  const out = [];
  for (const g of rows) {
    const target = Number(g.targetAmount);
    const realizado = await realizadoFor(g.periodType, g.periodKey);
    out.push({
      id: g.id,
      periodType: g.periodType as "month" | "semester" | "year",
      periodKey: g.periodKey,
      targetAmount: target,
      realizado,
      percent: target > 0 ? Math.round((realizado / target) * 1000) / 10 : 0,
      note: g.note ?? null,
      updatedAt: g.updatedAt ? g.updatedAt.toISOString() : null,
    });
  }
  out.sort((a, b) => b.periodKey.localeCompare(a.periodKey));
  res.json(out);
});

router.put("/financial-goals", requireCollaborator, async (req, res): Promise<void> => {
  const parsed = UpsertFinancialGoalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados invalidos", details: parsed.error.issues });
    return;
  }
  const { periodType, periodKey, targetAmount, note } = parsed.data;
  if (!periodBounds(periodType, periodKey)) {
    res.status(400).json({ error: `Chave de periodo invalida para ${periodType}: "${periodKey}".` });
    return;
  }
  const [row] = await db
    .insert(financialGoalsTable)
    .values({ periodType, periodKey, targetAmount: targetAmount.toFixed(2), note: note ?? null })
    .onConflictDoUpdate({
      target: [financialGoalsTable.periodType, financialGoalsTable.periodKey],
      set: { targetAmount: targetAmount.toFixed(2), note: note ?? null },
    })
    .returning();

  const target = Number(row.targetAmount);
  const realizado = await realizadoFor(row.periodType, row.periodKey);
  res.json({
    id: row.id,
    periodType: row.periodType as "month" | "semester" | "year",
    periodKey: row.periodKey,
    targetAmount: target,
    realizado,
    percent: target > 0 ? Math.round((realizado / target) * 1000) / 10 : 0,
    note: row.note ?? null,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  });
});

router.delete("/financial-goals/:id", requireCollaborator, async (req, res): Promise<void> => {
  const parsed = DeleteFinancialGoalParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "ID invalido" });
    return;
  }
  await db.delete(financialGoalsTable).where(eq(financialGoalsTable.id, parsed.data.id));
  res.status(204).end(); // contrato OpenAPI: 204 sem corpo
});

// ----------------------------------------------- RESUMO META x REALIZADO -----
router.get("/financial-goals/summary", requireCollaborator, async (req, res): Promise<void> => {
  const parsed = GetFinancialGoalsSummaryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Parametros invalidos", details: parsed.error.issues });
    return;
  }
  const periodType = parsed.data.periodType || "month";
  const goals = await db
    .select()
    .from(financialGoalsTable)
    .where(eq(financialGoalsTable.periodType, periodType));
  goals.sort((a, b) => a.periodKey.localeCompare(b.periodKey));

  const rows = [];
  let prevRealizado: number | null = null;
  for (const g of goals) {
    const target = Number(g.targetAmount);
    const realizado = await realizadoFor(g.periodType, g.periodKey);
    const growthPct =
      prevRealizado != null && prevRealizado > 0
        ? Math.round(((realizado - prevRealizado) / prevRealizado) * 1000) / 10
        : null;
    rows.push({
      periodKey: g.periodKey,
      target,
      realizado,
      percent: target > 0 ? Math.round((realizado / target) * 1000) / 10 : 0,
      growthPct,
    });
    prevRealizado = realizado;
  }

  res.json({
    periodType,
    rows,
    message: rows.length === 0 ? "Nenhuma meta cadastrada para este periodo." : null,
  });
});

export default router;
