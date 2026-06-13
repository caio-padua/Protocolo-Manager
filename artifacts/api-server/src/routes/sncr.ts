import { Router, type IRouter } from "express";
import { db, sncrRangesTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { CreateSncrRangeBody } from "@workspace/api-zod";
import { getSncrQuota } from "../lib/sncr";

const router: IRouter = Router();

function formatRange(r: typeof sncrRangesTable.$inferSelect) {
  return {
    ...r,
    professionalId: r.professionalId ?? null,
    professionalName: r.professionalName ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/sncr/ranges", async (_req, res): Promise<void> => {
  const rows = await db.select().from(sncrRangesTable).orderBy(desc(sncrRangesTable.createdAt));
  res.json(rows.map(formatRange));
});

router.post("/sncr/ranges", async (req, res): Promise<void> => {
  const parsed = CreateSncrRangeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const [row] = await db
    .insert(sncrRangesTable)
    .values({
      professionalId: data.professionalId ?? null,
      professionalName: data.professionalName ?? null,
      uf: data.uf.toUpperCase(),
      controlledType: data.controlledType,
      startNumber: data.startNumber,
      endNumber: data.endNumber,
      nextNumber: data.nextNumber ?? data.startNumber,
      active: data.active ?? true,
    })
    .returning();
  res.status(201).json(formatRange(row));
});

router.get("/sncr/quota", async (_req, res): Promise<void> => {
  const quotas = await getSncrQuota();
  res.json(quotas);
});

export default router;
