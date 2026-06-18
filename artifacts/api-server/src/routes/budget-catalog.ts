import { Router, type IRouter } from "express";
import { eq, ilike, asc } from "drizzle-orm";
import { db, budgetCatalogTable, budgetSettingsTable, substancesTable, DEFAULT_CARD_FEES } from "@workspace/db";
import {
  CreateBudgetCatalogItemBody,
  UpdateBudgetCatalogItemParams,
  UpdateBudgetCatalogItemBody,
  DeleteBudgetCatalogItemParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatItem(row: typeof budgetCatalogTable.$inferSelect) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    defaultDose: row.defaultDose ?? null,
    defaultSessions: row.defaultSessions,
    frequencyDays: row.frequencyDays ?? null,
    unitPriceCents: row.unitPriceCents,
    active: row.active,
    sortOrder: row.sortOrder,
    substanceId: row.substanceId ?? null,
  };
}

router.get("/budget-catalog", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(budgetCatalogTable)
    .orderBy(asc(budgetCatalogTable.sortOrder), asc(budgetCatalogTable.name));
  res.json(rows.map(formatItem));
});

router.post("/budget-catalog", async (req, res): Promise<void> => {
  const parsed = CreateBudgetCatalogItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const [row] = await db
    .insert(budgetCatalogTable)
    .values({
      kind: d.kind ?? "substance",
      name: d.name,
      defaultDose: d.defaultDose ?? null,
      defaultSessions: d.defaultSessions ?? 1,
      frequencyDays: d.frequencyDays ?? null,
      unitPriceCents: d.unitPriceCents,
      active: d.active ?? true,
      sortOrder: d.sortOrder ?? 0,
      substanceId: d.substanceId ?? null,
    })
    .returning();
  res.status(201).json(formatItem(row));
});

router.patch("/budget-catalog/:id", async (req, res): Promise<void> => {
  const params = UpdateBudgetCatalogItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateBudgetCatalogItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(budgetCatalogTable)
    .set(parsed.data)
    .where(eq(budgetCatalogTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Catalog item not found" });
    return;
  }
  res.json(formatItem(row));
});

router.delete("/budget-catalog/:id", async (req, res): Promise<void> => {
  const params = DeleteBudgetCatalogItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(budgetCatalogTable).where(eq(budgetCatalogTable.id, params.data.id));
  res.status(204).end();
});

// 10 itens iniciais. unitPriceCents em centavos. `match` liga a substances (vitrine).
const SEED_ITEMS: Array<{
  name: string;
  kind: string;
  unitPriceCents: number;
  defaultSessions: number;
  frequencyDays: number | null;
  match: string | null;
}> = [
  { name: "Testosterona Bioidentica", kind: "substance", unitPriceCents: 15000, defaultSessions: 12, frequencyDays: 7, match: "testosterona" },
  { name: "Tesamorelina", kind: "substance", unitPriceCents: 12000, defaultSessions: 12, frequencyDays: 7, match: "tesamorelina" },
  { name: "Tirzepatida", kind: "substance", unitPriceCents: 45000, defaultSessions: 12, frequencyDays: 7, match: "tirzepatida" },
  { name: "Peptideo X", kind: "substance", unitPriceCents: 35000, defaultSessions: 12, frequencyDays: 7, match: "peptideo" },
  { name: "Coenzima Q10", kind: "substance", unitPriceCents: 9000, defaultSessions: 12, frequencyDays: 7, match: "q10" },
  { name: "Vitamina D", kind: "substance", unitPriceCents: 8000, defaultSessions: 12, frequencyDays: 7, match: "vitamina d" },
  { name: "Vitamina B12", kind: "substance", unitPriceCents: 8000, defaultSessions: 12, frequencyDays: 7, match: "b12" },
  { name: "Dieta Personalizada", kind: "diet", unitPriceCents: 50000, defaultSessions: 1, frequencyDays: null, match: null },
  { name: "Formulas Manipuladas", kind: "formula", unitPriceCents: 25000, defaultSessions: 1, frequencyDays: null, match: null },
  { name: "Consulta Medica (60 min)", kind: "consultation", unitPriceCents: 60000, defaultSessions: 1, frequencyDays: null, match: null },
];

router.post("/budget-catalog/seed", async (_req, res): Promise<void> => {
  let catalogInserted = 0;

  for (let i = 0; i < SEED_ITEMS.length; i++) {
    const item = SEED_ITEMS[i];
    const [existing] = await db
      .select({ id: budgetCatalogTable.id })
      .from(budgetCatalogTable)
      .where(eq(budgetCatalogTable.name, item.name));
    if (existing) continue;

    let substanceId: number | null = null;
    if (item.match) {
      const [sub] = await db
        .select({ id: substancesTable.id })
        .from(substancesTable)
        .where(ilike(substancesTable.name, `%${item.match}%`))
        .limit(1);
      substanceId = sub?.id ?? null;
    }

    await db.insert(budgetCatalogTable).values({
      kind: item.kind,
      name: item.name,
      defaultSessions: item.defaultSessions,
      frequencyDays: item.frequencyDays,
      unitPriceCents: item.unitPriceCents,
      sortOrder: i,
      substanceId,
    });
    catalogInserted++;
  }

  const allRows = await db.select({ id: budgetCatalogTable.id }).from(budgetCatalogTable);

  // settings row id=1
  let settingsCreated = false;
  const [settings] = await db.select().from(budgetSettingsTable).where(eq(budgetSettingsTable.id, 1));
  if (!settings) {
    await db.insert(budgetSettingsTable).values({ id: 1, cardFees: DEFAULT_CARD_FEES });
    settingsCreated = true;
  }

  res.json({ catalogInserted, catalogTotal: allRows.length, settingsCreated });
});

export default router;
