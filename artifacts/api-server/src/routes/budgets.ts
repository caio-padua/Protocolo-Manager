import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, budgetsTable, clientsTable, type BudgetItemSnapshot } from "@workspace/db";
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
  };
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
router.post("/budgets/calculate", async (req, res): Promise<void> => {
  const parsed = CalculateBudgetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const settings = await getOrCreateSettings();
  const items: CalcItem[] = parsed.data.items.map((i) => ({
    unitPriceCents: i.unitPriceCents,
    sessions: i.sessions,
    include: i.include,
  }));
  const result = calculateBudget(items, toCalcSettings(settings), parsed.data.freeCalc);
  res.json(result);
});

router.get("/budgets", async (req, res): Promise<void> => {
  const query = ListBudgetsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  let rows = await db.select().from(budgetsTable).orderBy(desc(budgetsTable.createdAt));
  if (query.data.clientId) rows = rows.filter((b) => b.clientId === query.data.clientId);
  if (query.data.status) rows = rows.filter((b) => b.status === query.data.status);
  res.json(await Promise.all(rows.map(formatBudget)));
});

router.post("/budgets", async (req, res): Promise<void> => {
  const parsed = CreateBudgetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const items = (d.items ?? []) as BudgetItemSnapshot[];
  const computedTotal = items
    .filter((i) => i.include)
    .reduce((sum, i) => sum + Math.round(i.unitPriceCents) * Math.max(0, i.sessions), 0);

  const [row] = await db
    .insert(budgetsTable)
    .values({
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
  res.status(201).json(await formatBudget(row));
});

router.get("/budgets/:id", async (req, res): Promise<void> => {
  const params = GetBudgetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Budget not found" });
    return;
  }
  res.json(await formatBudget(row));
});

router.patch("/budgets/:id", async (req, res): Promise<void> => {
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
  const [current] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Budget not found" });
    return;
  }

  const d = parsed.data;
  const now = new Date();
  const [row] = await db
    .update(budgetsTable)
    .set({
      ...(d.clientId !== undefined ? { clientId: d.clientId } : {}),
      ...(d.title !== undefined ? { title: d.title } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.items !== undefined ? { items: d.items as BudgetItemSnapshot[] } : {}),
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
    .where(eq(budgetsTable.id, params.data.id))
    .returning();
  res.json(await formatBudget(row));
});

router.delete("/budgets/:id", async (req, res): Promise<void> => {
  const params = DeleteBudgetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(budgetsTable).where(eq(budgetsTable.id, params.data.id));
  res.status(204).end();
});

export default router;
