import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, substancesTable } from "@workspace/db";
import {
  CreateSubstanceBody,
  UpdateSubstanceParams,
  UpdateSubstanceBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatSubstance(s: typeof substancesTable.$inferSelect) {
  return {
    ...s,
    defaultDose: s.defaultDose ?? null,
    unit: s.unit ?? null,
    maxSessionsPerWeek: s.maxSessionsPerWeek ?? null,
    intervalDays: s.intervalDays ?? null,
    notes: s.notes ?? null,
    stockUnit: s.stockUnit ?? null,
    createdAt: s.createdAt.toISOString(),
  };
}

router.get("/substances", async (_req, res): Promise<void> => {
  const substances = await db.select().from(substancesTable);
  res.json(substances.map(formatSubstance));
});

router.post("/substances", async (req, res): Promise<void> => {
  const parsed = CreateSubstanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [substance] = await db.insert(substancesTable).values(parsed.data).returning();
  res.status(201).json(formatSubstance(substance));
});

router.put("/substances/:id", async (req, res): Promise<void> => {
  const params = UpdateSubstanceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSubstanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [substance] = await db.update(substancesTable).set(parsed.data).where(eq(substancesTable.id, params.data.id)).returning();
  if (!substance) {
    res.status(404).json({ error: "Substance not found" });
    return;
  }

  res.json(formatSubstance(substance));
});

const PATCHABLE_FIELDS = [
  "name", "category", "color", "defaultDose", "unit", "maxSessionsPerWeek", "intervalDays",
  "notes", "stockQuantity", "stockUnit", "procedureType", "durationMinutes", "description",
  "mainFunction", "perceivedEffects", "timeToEffect", "starRating", "bodySystemEffects",
  "longevityBenefit", "qualityOfLifeImpact", "sleepBenefit", "energyBenefit", "libidoBenefit",
  "physicalPerformance", "muscleStrength", "mentalClarity", "skinHairNails", "immuneSupport",
  "contraindications", "scientificEvidence", "categoryType",
] as const;

router.patch("/substances/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const updates: Record<string, any> = {};
  for (const key of PATCHABLE_FIELDS) {
    if (key in req.body) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [substance] = await db.update(substancesTable).set(updates).where(eq(substancesTable.id, id)).returning();
  if (!substance) {
    res.status(404).json({ error: "Substance not found" });
    return;
  }

  res.json(formatSubstance(substance));
});

export default router;
