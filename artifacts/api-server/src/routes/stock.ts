import { Router, type IRouter } from "express";
import { moduleGuard } from "../middleware/moduleGuard";
import { eq, and } from "drizzle-orm";
import { resolveEmpresaId } from "../middleware/tenantContext";
import { db, stockItemsTable, substancesTable } from "@workspace/db";
import {
  CreateStockItemBody,
  UpdateStockItemParams,
  UpdateStockItemBody,
} from "@workspace/api-zod";

const router: IRouter = Router();
router.use(moduleGuard("estoque"));

const EXPIRING_SOON_DAYS = 60; // 2 meses

async function formatStockItem(item: typeof stockItemsTable.$inferSelect) {
  const [substance] = await db.select().from(substancesTable).where(eq(substancesTable.id, item.substanceId));

  const now = new Date();
  const expDate = item.expirationDate ? new Date(item.expirationDate) : null;
  const daysToExpiry = expDate ? Math.ceil((expDate.getTime() - now.getTime()) / 86400000) : null;

  let status: "normal" | "low" | "critical" | "overflow" | "expired" | "expiring_soon" = "normal";

  if (expDate && expDate < now) {
    status = "expired";
  } else if (daysToExpiry !== null && daysToExpiry <= EXPIRING_SOON_DAYS) {
    status = "expiring_soon";
  } else if (item.quantity <= 0) {
    status = "critical";
  } else if (item.quantity <= item.minimumStock) {
    status = "low";
  } else if (item.maximumStock != null && item.quantity > item.maximumStock) {
    status = "overflow";
  }

  return {
    id: item.id,
    substanceId: item.substanceId,
    substanceName: substance?.name ?? "",
    substanceColor: substance?.color ?? "#888888",
    substanceMg: substance?.concentrationMg ?? null,
    substanceVolume: substance?.volumeAmpola ?? null,
    quantity: item.quantity,
    unit: item.unit,
    minimumStock: item.minimumStock,
    maximumStock: item.maximumStock ?? null,
    lot: item.lot ?? null,
    expirationDate: item.expirationDate ?? null,
    supplier: item.supplier ?? null,
    unitCost: item.unitCost ?? null,
    status,
    updatedAt: item.updatedAt.toISOString(),
  };
}

router.get("/stock", async (req, res): Promise<void> => {
  const empresaId = resolveEmpresaId(req);
  const items = await db.select().from(stockItemsTable).where(eq(stockItemsTable.empresaId, empresaId));
  const results = await Promise.all(items.map(formatStockItem));
  res.json(results);
});

router.post("/stock", async (req, res): Promise<void> => {
  const parsed = CreateStockItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const empresaId = resolveEmpresaId(req);
  const [item] = await db.insert(stockItemsTable).values({ ...parsed.data, empresaId }).returning();
  res.status(201).json(await formatStockItem(item));
});

router.put("/stock/:id", async (req, res): Promise<void> => {
  const params = UpdateStockItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateStockItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db.update(stockItemsTable).set(parsed.data).where(eq(stockItemsTable.id, params.data.id)).returning();
  if (!item) {
    res.status(404).json({ error: "Stock item not found" });
    return;
  }

  res.json(await formatStockItem(item));
});

export default router;
