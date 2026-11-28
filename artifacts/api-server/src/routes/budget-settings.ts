import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pool, budgetSettingsTable, DEFAULT_CARD_FEES, type CardFee, type VolumeTier } from "@workspace/db";
import { UpdateBudgetSettingsBody } from "@workspace/api-zod";
import { DEFAULT_ITEM_VOLUME_TIERS, DEFAULT_CART_VOLUME_TIERS } from "../lib/budget-calc";
import { exigirComercial, FERRAMENTA_POLITICA_COMERCIAL } from "../lib/comercial-acesso";
import { lerPoliticaClinica } from "../lib/comercial-politica";

const router: IRouter = Router();

export type ResolvedSettings = typeof budgetSettingsTable.$inferSelect & {
  cardFees: CardFee[];
  itemVolumeTiers: VolumeTier[];
  cartVolumeTiers: VolumeTier[];
};

// Politica da CLINICA informada (sempre a da sessao). Cria a linha da clinica com os defaults se ainda nao existir.
export async function getOrCreateSettings(empresaId: number): Promise<ResolvedSettings> {
  await lerPoliticaClinica(pool, empresaId);
  const [row] = await db.select().from(budgetSettingsTable).where(eq(budgetSettingsTable.empresaId, empresaId));
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

router.get("/budget-settings", exigirComercial(), async (req, res): Promise<void> => {
  res.json(formatSettings(await getOrCreateSettings(req.comercial!.empresaId)));
});

router.put("/budget-settings", exigirComercial(FERRAMENTA_POLITICA_COMERCIAL), async (req, res): Promise<void> => {
  const parsed = UpdateBudgetSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const empresaId = req.comercial!.empresaId;
  await getOrCreateSettings(empresaId);

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
    .where(eq(budgetSettingsTable.empresaId, empresaId))
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
