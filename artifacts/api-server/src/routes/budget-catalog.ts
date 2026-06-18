import { Router, type IRouter } from "express";
import { eq, ilike, asc } from "drizzle-orm";
import { db, budgetCatalogTable, budgetSettingsTable, substancesTable, DEFAULT_CARD_FEES } from "@workspace/db";
import {
  CreateBudgetCatalogItemBody,
  UpdateBudgetCatalogItemParams,
  UpdateBudgetCatalogItemBody,
  DeleteBudgetCatalogItemParams,
} from "@workspace/api-zod";
import { DEFAULT_ITEM_VOLUME_TIERS, DEFAULT_CART_VOLUME_TIERS } from "../lib/budget-calc";

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
    repeticaoLivre: row.repeticaoLivre,
    maxAplicacoesMes: row.maxAplicacoesMes ?? null,
    minAplicacoesMes: row.minAplicacoesMes ?? null,
    itemVolumeTiers: row.itemVolumeTiers ?? null,
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
      repeticaoLivre: d.repeticaoLivre ?? true,
      maxAplicacoesMes: d.maxAplicacoesMes ?? null,
      minAplicacoesMes: d.minAplicacoesMes ?? null,
      itemVolumeTiers: d.itemVolumeTiers ?? null,
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

// Itens iniciais. unitPriceCents em centavos. `match` liga a substances (vitrine).
// Campos clinicos (Fase 2): repeticaoLivre=false => limitado por mes (hormonio,
// Vitamina D); max/min = teto/piso clinico de aplicacoes por mes.
const SEED_ITEMS: Array<{
  name: string;
  kind: string;
  unitPriceCents: number;
  defaultSessions: number;
  frequencyDays: number | null;
  match: string | null;
  repeticaoLivre: boolean;
  maxAplicacoesMes: number | null;
  minAplicacoesMes: number | null;
}> = [
  { name: "Testosterona Bioidentica", kind: "substance", unitPriceCents: 15000, defaultSessions: 12, frequencyDays: 7, match: "testosterona", repeticaoLivre: false, maxAplicacoesMes: 4, minAplicacoesMes: 1 },
  { name: "Tesamorelina", kind: "substance", unitPriceCents: 12000, defaultSessions: 12, frequencyDays: 7, match: "tesamorelina", repeticaoLivre: true, maxAplicacoesMes: null, minAplicacoesMes: null },
  { name: "Tirzepatida", kind: "substance", unitPriceCents: 45000, defaultSessions: 12, frequencyDays: 7, match: "tirzepatida", repeticaoLivre: false, maxAplicacoesMes: 4, minAplicacoesMes: 1 },
  { name: "Peptideo X", kind: "substance", unitPriceCents: 35000, defaultSessions: 12, frequencyDays: 7, match: "peptideo", repeticaoLivre: true, maxAplicacoesMes: null, minAplicacoesMes: null },
  { name: "Coenzima Q10", kind: "substance", unitPriceCents: 9000, defaultSessions: 12, frequencyDays: 7, match: "q10", repeticaoLivre: true, maxAplicacoesMes: null, minAplicacoesMes: null },
  { name: "Vitamina D", kind: "substance", unitPriceCents: 8000, defaultSessions: 12, frequencyDays: 7, match: "vitamina d", repeticaoLivre: false, maxAplicacoesMes: 4, minAplicacoesMes: 1 },
  { name: "Vitamina B12", kind: "substance", unitPriceCents: 8000, defaultSessions: 12, frequencyDays: 7, match: "b12", repeticaoLivre: true, maxAplicacoesMes: null, minAplicacoesMes: null },
  { name: "PQQ (Pirroloquinolina Quinona)", kind: "substance", unitPriceCents: 11000, defaultSessions: 12, frequencyDays: 7, match: "pqq", repeticaoLivre: true, maxAplicacoesMes: null, minAplicacoesMes: null },
  { name: "Dieta Personalizada", kind: "diet", unitPriceCents: 50000, defaultSessions: 1, frequencyDays: null, match: null, repeticaoLivre: true, maxAplicacoesMes: null, minAplicacoesMes: null },
  { name: "Formulas Manipuladas", kind: "formula", unitPriceCents: 25000, defaultSessions: 1, frequencyDays: null, match: null, repeticaoLivre: true, maxAplicacoesMes: null, minAplicacoesMes: null },
  { name: "Consulta Medica (60 min)", kind: "consultation", unitPriceCents: 60000, defaultSessions: 1, frequencyDays: null, match: null, repeticaoLivre: true, maxAplicacoesMes: null, minAplicacoesMes: null },
];

router.post("/budget-catalog/seed", async (_req, res): Promise<void> => {
  let catalogInserted = 0;
  let catalogBackfilled = 0;

  for (let i = 0; i < SEED_ITEMS.length; i++) {
    const item = SEED_ITEMS[i];
    const [existing] = await db
      .select({ id: budgetCatalogTable.id, maxAplicacoesMes: budgetCatalogTable.maxAplicacoesMes })
      .from(budgetCatalogTable)
      .where(eq(budgetCatalogTable.name, item.name));

    if (existing) {
      // Backfill idempotente: so preenche teto clinico se ainda nao foi definido,
      // para nao sobrescrever edicoes manuais do CEO.
      if (existing.maxAplicacoesMes == null && item.maxAplicacoesMes != null) {
        await db
          .update(budgetCatalogTable)
          .set({
            repeticaoLivre: item.repeticaoLivre,
            maxAplicacoesMes: item.maxAplicacoesMes,
            minAplicacoesMes: item.minAplicacoesMes,
          })
          .where(eq(budgetCatalogTable.id, existing.id));
        catalogBackfilled++;
      }
      continue;
    }

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
      repeticaoLivre: item.repeticaoLivre,
      maxAplicacoesMes: item.maxAplicacoesMes,
      minAplicacoesMes: item.minAplicacoesMes,
    });
    catalogInserted++;
  }

  const allRows = await db.select({ id: budgetCatalogTable.id }).from(budgetCatalogTable);

  // settings row id=1 (com escadas de volume default)
  let settingsCreated = false;
  const [settings] = await db.select().from(budgetSettingsTable).where(eq(budgetSettingsTable.id, 1));
  if (!settings) {
    await db.insert(budgetSettingsTable).values({
      id: 1,
      cardFees: DEFAULT_CARD_FEES,
      itemVolumeTiers: DEFAULT_ITEM_VOLUME_TIERS,
      cartVolumeTiers: DEFAULT_CART_VOLUME_TIERS,
    });
    settingsCreated = true;
  } else if (settings.itemVolumeTiers == null || settings.cartVolumeTiers == null) {
    // Backfill das escadas em settings ja existente (Fase 1 -> Fase 2).
    await db
      .update(budgetSettingsTable)
      .set({
        itemVolumeTiers: settings.itemVolumeTiers ?? DEFAULT_ITEM_VOLUME_TIERS,
        cartVolumeTiers: settings.cartVolumeTiers ?? DEFAULT_CART_VOLUME_TIERS,
      })
      .where(eq(budgetSettingsTable.id, 1));
  }

  res.json({ catalogInserted, catalogBackfilled, catalogTotal: allRows.length, settingsCreated });
});

export default router;
