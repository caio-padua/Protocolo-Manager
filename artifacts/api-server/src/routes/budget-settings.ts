import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, budgetSettingsTable, DEFAULT_CARD_FEES, type CardFee, type VolumeTier } from "@workspace/db";
import { UpdateBudgetSettingsBody } from "@workspace/api-zod";
import { DEFAULT_ITEM_VOLUME_TIERS, DEFAULT_CART_VOLUME_TIERS } from "../lib/budget-calc";

const router: IRouter = Router();

export type ResolvedSettings = typeof budgetSettingsTable.$inferSelect & {
  cardFees: CardFee[];
  itemVolumeTiers: VolumeTier[];
  cartVolumeTiers: VolumeTier[];
};

// Garante a linha unica id=1, criando-a com os defaults (taxas de cartao +
// escadas de volume) caso ainda nao exista. Retorna sempre os jsonb preenchidos.
export async function getOrCreateSettings(): Promise<ResolvedSettings> {
  let [row] = await db.select().from(budgetSettingsTable).where(eq(budgetSettingsTable.id, 1));
  if (!row) {
    [row] = await db
      .insert(budgetSettingsTable)
      .values({
        id: 1,
        cardFees: DEFAULT_CARD_FEES,
        itemVolumeTiers: DEFAULT_ITEM_VOLUME_TIERS,
        cartVolumeTiers: DEFAULT_CART_VOLUME_TIERS,
      })
      .returning();
  }
  return {
    ...row,
    cardFees: row.cardFees ?? DEFAULT_CARD_FEES,
    itemVolumeTiers: row.itemVolumeTiers ?? DEFAULT_ITEM_VOLUME_TIERS,
    cartVolumeTiers: row.cartVolumeTiers ?? DEFAULT_CART_VOLUME_TIERS,
  };
}

function formatSettings(row: ResolvedSettings) {
  return {
    id: row.id,
    cashDiscountPct: row.cashDiscountPct,
    down50DiscountPct: row.down50DiscountPct,
    down30DiscountPct: row.down30DiscountPct,
    maxNoInterestInstallments: row.maxNoInterestInstallments,
    planMonths: row.planMonths,
    planWeeks: row.planWeeks,
    planDays: row.planDays,
    cardFees: row.cardFees,
    recommendedScenario: row.recommendedScenario,
    passCardFeeDefault: row.passCardFeeDefault,
    itemVolumeTiers: row.itemVolumeTiers,
    cartVolumeTiers: row.cartVolumeTiers,
    maxTotalDiscountPct: row.maxTotalDiscountPct,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

router.get("/budget-settings", async (_req, res): Promise<void> => {
  const row = await getOrCreateSettings();
  res.json(formatSettings(row));
});

router.put("/budget-settings", async (req, res): Promise<void> => {
  const parsed = UpdateBudgetSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await getOrCreateSettings();

  const data = parsed.data;
  const [row] = await db
    .update(budgetSettingsTable)
    .set({
      ...(data.cashDiscountPct !== undefined ? { cashDiscountPct: data.cashDiscountPct } : {}),
      ...(data.down50DiscountPct !== undefined ? { down50DiscountPct: data.down50DiscountPct } : {}),
      ...(data.down30DiscountPct !== undefined ? { down30DiscountPct: data.down30DiscountPct } : {}),
      ...(data.maxNoInterestInstallments !== undefined ? { maxNoInterestInstallments: data.maxNoInterestInstallments } : {}),
      ...(data.planMonths !== undefined ? { planMonths: data.planMonths } : {}),
      ...(data.planWeeks !== undefined ? { planWeeks: data.planWeeks } : {}),
      ...(data.planDays !== undefined ? { planDays: data.planDays } : {}),
      ...(data.cardFees !== undefined ? { cardFees: data.cardFees as CardFee[] } : {}),
      ...(data.recommendedScenario !== undefined ? { recommendedScenario: data.recommendedScenario } : {}),
      ...(data.passCardFeeDefault !== undefined ? { passCardFeeDefault: data.passCardFeeDefault } : {}),
      ...(data.itemVolumeTiers !== undefined ? { itemVolumeTiers: data.itemVolumeTiers as VolumeTier[] } : {}),
      ...(data.cartVolumeTiers !== undefined ? { cartVolumeTiers: data.cartVolumeTiers as VolumeTier[] } : {}),
      ...(data.maxTotalDiscountPct !== undefined ? { maxTotalDiscountPct: data.maxTotalDiscountPct } : {}),
    })
    .where(eq(budgetSettingsTable.id, 1))
    .returning();

  res.json(
    formatSettings({
      ...row,
      cardFees: row.cardFees ?? DEFAULT_CARD_FEES,
      itemVolumeTiers: row.itemVolumeTiers ?? DEFAULT_ITEM_VOLUME_TIERS,
      cartVolumeTiers: row.cartVolumeTiers ?? DEFAULT_CART_VOLUME_TIERS,
    }),
  );
});

export default router;
