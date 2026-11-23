import { Router, type IRouter } from "express";
import { and, eq, desc, inArray } from "drizzle-orm";
import { db, pool, budgetsTable, budgetCatalogTable, clientsTable, type BudgetItemSnapshot } from "@workspace/db";
import {
  CalculateBudgetBody,
  ListBudgetsQueryParams,
  CreateBudgetBody,
  GetBudgetParams,
  UpdateBudgetParams,
  UpdateBudgetBody,
  DeleteBudgetParams,
} from "@workspace/api-zod";
import { calculateBudget, type CalcItem, type CalcSettings } from "../lib/budget-calc";
import { getOrCreateSettings } from "./budget-settings";
import { exigirComercial } from "../lib/comercial-acesso";
import { registrarEventoOrcamento, transicaoPermitida } from "../lib/comercial-politica";

const router: IRouter = Router();

function toCalcSettings(s: Awaited<ReturnType<typeof getOrCreateSettings>>): CalcSettings {
  return {
    cashDiscountPct: s.cashDiscountPct,
    down50DiscountPct: s.down50DiscountPct,
    down30DiscountPct: s.down30DiscountPct,
    maxNoInterestInstallments: s.maxNoInterestInstallments,
    planMonths: s.planMonths,
    planWeeks: s.planWeeks,
    planDays: s.planDays,
    cardFees: s.cardFees,
    recommendedScenario: s.recommendedScenario,
    passCardFeeDefault: s.passCardFeeDefault,
    itemVolumeTiers: s.itemVolumeTiers,
    cartVolumeTiers: s.cartVolumeTiers,
    maxTotalDiscountPct: s.maxTotalDiscountPct,
  };
}

/** O cliente informado precisa ser da clinica da sessao (nunca se grava orcamento para cliente de outra clinica). */
async function clienteDaClinica(clientId: number, empresaId: number): Promise<boolean> {
  const r = await pool.query("SELECT 1 FROM clients WHERE id=$1 AND empresa_id=$2", [clientId, empresaId]);
  return r.rows.length > 0;
}

/** Congela no snapshot a escada de volume PROPRIA de cada item (do catalogo), para Montagem e Apresentacao nunca divergirem. */
async function congelarEscadas(items: BudgetItemSnapshot[]): Promise<BudgetItemSnapshot[]> {
  const ids = [...new Set(items.filter((i) => i.volumeTiers === undefined && typeof i.catalogId === "number").map((i) => i.catalogId as number))];
  const mapa = new Map<number, BudgetItemSnapshot["volumeTiers"]>();
  if (ids.length) {
    const rows = await db.select({ id: budgetCatalogTable.id, t: budgetCatalogTable.itemVolumeTiers }).from(budgetCatalogTable).where(inArray(budgetCatalogTable.id, ids));
    for (const r of rows) mapa.set(r.id, r.t ?? null);
  }
  return items.map((i) => (i.volumeTiers !== undefined ? i : { ...i, volumeTiers: typeof i.catalogId === "number" ? (mapa.get(i.catalogId) ?? null) : null }));
}

async function formatBudget(row: typeof budgetsTable.$inferSelect) {
  let clientName: string | null = null;
  if (row.clientId) {
    const [c] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, row.clientId));
    clientName = c?.name ?? null;
  }
  return {
    id: row.id,
    clientId: row.clientId ?? null,
    clientName,
    title: row.title ?? null,
    status: row.status,
    items: row.items ?? [],
    settingsSnapshot: row.settingsSnapshot ?? null,
    totalsSnapshot: row.totalsSnapshot ?? null,
    chosenScenario: row.chosenScenario ?? null,
    chosenDetail: row.chosenDetail ?? null,
    totalCents: row.totalCents,
    liberarFrequencia: row.liberarFrequencia,
    repassarTaxa: row.repassarTaxa,
    createdBy: row.createdBy ?? null,
    presentedAt: row.presentedAt ? row.presentedAt.toISOString() : null,
    acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    convertedProtocolId: row.convertedProtocolId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

// --- CALCULO (stateless): precisa vir ANTES de /budgets/:id ---
router.post("/budgets/calculate", exigirComercial(), async (req, res): Promise<void> => {
  const parsed = CalculateBudgetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const settings = await getOrCreateSettings(req.comercial!.empresaId);
  const items: CalcItem[] = parsed.data.items.map((i) => ({
    unitPriceCents: i.unitPriceCents,
    sessions: i.sessions,
    include: i.include,
    volumeTiers: i.volumeTiers ?? null,
  }));
  const result = calculateBudget(items, toCalcSettings(settings), parsed.data.freeCalc);
  res.json(result);
});

router.get("/budgets", exigirComercial(), async (req, res): Promise<void> => {
  const query = ListBudgetsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  let rows = await db.select().from(budgetsTable).where(eq(budgetsTable.empresaId, req.comercial!.empresaId)).orderBy(desc(budgetsTable.createdAt));
  if (query.data.clientId) rows = rows.filter((b) => b.clientId === query.data.clientId);
  if (query.data.status) rows = rows.filter((b) => b.status === query.data.status);
  res.json(await Promise.all(rows.map(formatBudget)));
});

router.post("/budgets", exigirComercial(), async (req, res): Promise<void> => {
  const parsed = CreateBudgetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const empresaId = req.comercial!.empresaId;
  if (d.clientId != null && !(await clienteDaClinica(d.clientId, empresaId))) {
    res.status(404).json({ error: "Cliente não encontrado nesta clínica." });
    return;
  }
  const items = await congelarEscadas((d.items ?? []) as BudgetItemSnapshot[]);
  const computedTotal = items
    .filter((i) => i.include)
    .reduce((sum, i) => sum + Math.round(i.unitPriceCents) * Math.max(0, i.sessions), 0);

  const [row] = await db
    .insert(budgetsTable)
    .values({
      empresaId,
      clientId: d.clientId ?? null,
      title: d.title ?? null,
      status: d.status ?? "draft",
      items,
      settingsSnapshot: d.settingsSnapshot ?? null,
      totalsSnapshot: d.totalsSnapshot ?? null,
      chosenScenario: d.chosenScenario ?? null,
      chosenDetail: d.chosenDetail ?? null,
      totalCents: d.totalCents ?? computedTotal,
      liberarFrequencia: d.liberarFrequencia ?? false,
      repassarTaxa: d.repassarTaxa ?? false,
      createdBy: d.createdBy ?? null,
    })
    .returning();
  await registrarEventoOrcamento(pool, { empresaId, budgetId: row.id, tipo: "criado", para: row.status, usuarioId: req.comercial!.usuarioId });
  res.status(201).json(await formatBudget(row));
});

router.get("/budgets/:id", exigirComercial(), async (req, res): Promise<void> => {
  const params = GetBudgetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.select().from(budgetsTable).where(and(eq(budgetsTable.id, params.data.id), eq(budgetsTable.empresaId, req.comercial!.empresaId)));
  if (!row) {
    res.status(404).json({ error: "Budget not found" });
    return;
  }
  res.json(await formatBudget(row));
});

router.patch("/budgets/:id", exigirComercial(), async (req, res): Promise<void> => {
  const params = UpdateBudgetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateBudgetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const empresaId = req.comercial!.empresaId;
  const [current] = await db.select().from(budgetsTable).where(and(eq(budgetsTable.id, params.data.id), eq(budgetsTable.empresaId, empresaId)));
  if (!current) {
    res.status(404).json({ error: "Budget not found" });
    return;
  }

  const d = parsed.data;
  if (d.status !== undefined && !transicaoPermitida(current.status, d.status)) {
    res.status(409).json({ error: `Transição de ${current.status} para ${d.status} não é permitida.` });
    return;
  }
  if (d.clientId != null && d.clientId !== current.clientId && !(await clienteDaClinica(d.clientId, empresaId))) {
    res.status(404).json({ error: "Cliente não encontrado nesta clínica." });
    return;
  }
  const itensCongelados = d.items !== undefined ? await congelarEscadas(d.items as BudgetItemSnapshot[]) : undefined;
  const now = new Date();
  const [row] = await db
    .update(budgetsTable)
    .set({
      ...(d.clientId !== undefined ? { clientId: d.clientId } : {}),
      ...(d.title !== undefined ? { title: d.title } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(itensCongelados !== undefined ? { items: itensCongelados } : {}),
      ...(d.settingsSnapshot !== undefined ? { settingsSnapshot: d.settingsSnapshot } : {}),
      ...(d.totalsSnapshot !== undefined ? { totalsSnapshot: d.totalsSnapshot } : {}),
      ...(d.chosenScenario !== undefined ? { chosenScenario: d.chosenScenario } : {}),
      ...(d.chosenDetail !== undefined ? { chosenDetail: d.chosenDetail } : {}),
      ...(d.totalCents !== undefined ? { totalCents: d.totalCents } : {}),
      ...(d.liberarFrequencia !== undefined ? { liberarFrequencia: d.liberarFrequencia } : {}),
      ...(d.repassarTaxa !== undefined ? { repassarTaxa: d.repassarTaxa } : {}),
      ...(d.convertedProtocolId !== undefined ? { convertedProtocolId: d.convertedProtocolId } : {}),
      ...(d.status === "presented" && !current.presentedAt ? { presentedAt: now } : {}),
      ...(d.status === "accepted" && !current.acceptedAt ? { acceptedAt: now } : {}),
    })
    .where(and(eq(budgetsTable.id, params.data.id), eq(budgetsTable.empresaId, empresaId)))
    .returning();
  if (d.status !== undefined && d.status !== current.status) {
    await registrarEventoOrcamento(pool, { empresaId, budgetId: row.id, tipo: "status", de: current.status, para: d.status, usuarioId: req.comercial!.usuarioId });
  }
  res.json(await formatBudget(row));
});

router.delete("/budgets/:id", exigirComercial(), async (req, res): Promise<void> => {
  const params = DeleteBudgetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  // Regra de Ouro: orcamento nunca e apagado. "Excluir" cancela (logico) e fica na trilha de eventos.
  const empresaId = req.comercial!.empresaId;
  const [atual] = await db.select().from(budgetsTable).where(and(eq(budgetsTable.id, params.data.id), eq(budgetsTable.empresaId, empresaId)));
  if (!atual) {
    res.status(404).json({ error: "Budget not found" });
    return;
  }
  if (!transicaoPermitida(atual.status, "cancelled")) {
    res.status(409).json({ error: `Orçamento ${atual.status} não pode ser cancelado.` });
    return;
  }
  if (atual.status !== "cancelled") {
    await db.update(budgetsTable).set({ status: "cancelled" }).where(and(eq(budgetsTable.id, atual.id), eq(budgetsTable.empresaId, empresaId)));
    await registrarEventoOrcamento(pool, { empresaId, budgetId: atual.id, tipo: "cancelado", de: atual.status, para: "cancelled", usuarioId: req.comercial!.usuarioId });
  }
  res.status(204).end();
});

export default router;
