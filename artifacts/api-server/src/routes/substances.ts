import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, substancesTable, substanceBlendComponentsTable } from "@workspace/db";
import {
  CreateSubstanceBody,
  UpdateSubstanceParams,
  UpdateSubstanceBody,
} from "@workspace/api-zod";
import { configuredDurationSeconds, durationSecondsFromMinutes, substanceDurationMinutes } from "../lib/substance-duration";
import { requireCollaborator } from "./collaborator";

const router: IRouter = Router();

// O catálogo é compartilhado: uma clínica não pode alterar o cadastro global
// das demais usando apenas o acesso de colaborador da própria clínica.
function requireCatalogOwner(req: Request, res: Response, next: NextFunction) {
  requireCollaborator(req, res, () => {
    if (!req.tenantContext?.authenticated || req.tenantContext.professionalId !== req.collaborator?.professionalId) {
      res.status(401).json({ error: "Entre com seu acesso profissional." });
      return;
    }
    if (!req.tenantContext.isPlatformOwner) {
      res.status(403).json({ error: "A edição do catálogo compartilhado exige o proprietário da plataforma." });
      return;
    }
    next();
  });
}

function formatSubstance(s: typeof substancesTable.$inferSelect) {
  const { preciseDurationSeconds: _preciseDurationSeconds, ...rest } = s;
  return {
    ...rest,
    durationMinutes: substanceDurationMinutes(s),
    defaultDose: s.defaultDose ?? null,
    unit: s.unit ?? null,
    maxSessionsPerWeek: s.maxSessionsPerWeek ?? null,
    intervalDays: s.intervalDays ?? null,
    notes: s.notes ?? null,
    stockUnit: s.stockUnit ?? null,
    createdAt: s.createdAt.toISOString(),
  };
}

function serializeComponent(component: typeof substanceBlendComponentsTable.$inferSelect) {
  return {
    id: component.id,
    substanceId: component.substanceId,
    componentSubstanceId: component.componentSubstanceId ?? null,
    sortOrder: component.sortOrder,
    componentName: component.componentName,
    doseValue: component.doseValue ?? null,
    doseUnit: component.doseUnit ?? null,
    quantity: component.quantity ?? null,
    quantityUnit: component.quantityUnit ?? null,
    notes: component.notes ?? null,
  };
}

router.get("/substances", async (_req, res): Promise<void> => {
  const substances = await db.select().from(substancesTable);
  const components = await db.select().from(substanceBlendComponentsTable);
  const bySubstance = new Map<number, ReturnType<typeof serializeComponent>[]>();
  for (const component of components) {
    const current = bySubstance.get(component.substanceId) ?? [];
    current.push(serializeComponent(component));
    bySubstance.set(component.substanceId, current);
  }
  res.json(substances.map((substance) => ({
    ...formatSubstance(substance),
    components: (bySubstance.get(substance.id) ?? []).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
    ),
  })));
});

router.get("/substances/:id/components", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const components = await db
    .select()
    .from(substanceBlendComponentsTable)
    .where(eq(substanceBlendComponentsTable.substanceId, id));
  res.json(components
    .map(serializeComponent)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id));
});

router.put("/substances/:id/components", requireCatalogOwner, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [substance] = await db
    .select({ id: substancesTable.id })
    .from(substancesTable)
    .where(eq(substancesTable.id, id));
  if (!substance) {
    res.status(404).json({ error: "Substance not found" });
    return;
  }

  const rawComponents = Array.isArray(req.body?.components) ? req.body.components : null;
  if (!rawComponents) {
    res.status(400).json({ error: "components must be an array" });
    return;
  }
  try {
    const components = rawComponents.map((component: any, index: number) => {
      const componentName = String(component?.componentName ?? "").trim();
      if (!componentName) throw new Error(`Component ${index + 1} needs a name`);
      const numberOrNull = (value: unknown) => {
        if (value === null || value === undefined || value === "") return null;
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric value in component ${index + 1}`);
        return parsed;
      };
      return {
        substanceId: id,
        componentSubstanceId: numberOrNull(component?.componentSubstanceId),
        sortOrder: index + 1,
        componentName,
        doseValue: numberOrNull(component?.doseValue),
        doseUnit: component?.doseUnit ? String(component.doseUnit).trim() : null,
        quantity: numberOrNull(component?.quantity),
        quantityUnit: component?.quantityUnit ? String(component.quantityUnit).trim() : null,
        notes: component?.notes ? String(component.notes).trim() : null,
      };
    });
    const isBlend = typeof req.body?.isBlend === "boolean"
      ? req.body.isBlend
      : components.length > 0;

    await db.transaction(async (tx) => {
      await tx.delete(substanceBlendComponentsTable)
        .where(eq(substanceBlendComponentsTable.substanceId, id));
      if (components.length > 0) {
        await tx.insert(substanceBlendComponentsTable).values(components);
      }
      await tx.update(substancesTable)
        .set({ isBlend })
        .where(eq(substancesTable.id, id));
    });
  } catch (error: any) {
    res.status(400).json({ error: error?.message ?? "Could not save blend components" });
    return;
  }

  const saved = await db
    .select()
    .from(substanceBlendComponentsTable)
    .where(eq(substanceBlendComponentsTable.substanceId, id));
  res.json(saved.map(serializeComponent));
});

router.post("/substances", requireCatalogOwner, async (req, res): Promise<void> => {
  const parsed = CreateSubstanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { durationMinutes, ...data } = parsed.data;
  let preciseDurationSeconds: number | null;
  try {
    preciseDurationSeconds = durationMinutes === undefined
      ? await configuredDurationSeconds(data.procedureType ?? "iv")
      : durationSecondsFromMinutes(durationMinutes);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Duração inválida." });
    return;
  }
  const [substance] = await db.insert(substancesTable).values({ ...data, preciseDurationSeconds }).returning();
  res.status(201).json(formatSubstance(substance));
});

router.put("/substances/:id", requireCatalogOwner, async (req, res): Promise<void> => {
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

  const { durationMinutes, ...data } = parsed.data;
  let preciseDurationSeconds: number | undefined;
  try {
    if (durationMinutes !== undefined) preciseDurationSeconds = durationSecondsFromMinutes(durationMinutes);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Duração inválida." });
    return;
  }
  const [substance] = await db.update(substancesTable)
    .set({ ...data, ...(preciseDurationSeconds === undefined ? {} : { preciseDurationSeconds }) })
    .where(eq(substancesTable.id, params.data.id)).returning();
  if (!substance) {
    res.status(404).json({ error: "Substance not found" });
    return;
  }

  res.json(formatSubstance(substance));
});

const PATCHABLE_FIELDS = [
  "name", "category", "color", "defaultDose", "unit", "maxSessionsPerWeek", "intervalDays",
  "notes", "stockQuantity", "stockUnit", "procedureType", "doctorParticipation", "durationMinutes", "description",
  "mainFunction", "perceivedEffects", "timeToEffect", "starRating", "bodySystemEffects",
  "longevityBenefit", "qualityOfLifeImpact", "sleepBenefit", "energyBenefit", "libidoBenefit",
  "physicalPerformance", "muscleStrength", "mentalClarity", "skinHairNails", "immuneSupport",
  "contraindications", "scientificEvidence", "categoryType",
  "categoryMeters", "pricePerUnit", "composicao", "posologia",
  "isBlend", "presentationQuantity", "presentationUnit", "ampouleVolumeMl",
] as const;

router.patch("/substances/:id", requireCatalogOwner, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
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
  if ("doctorParticipation" in updates && updates.doctorParticipation !== null &&
      typeof updates.doctorParticipation !== "boolean") {
    res.status(400).json({ error: "A participação médica deve ser sim, não ou não definida." });
    return;
  }
  if ("durationMinutes" in updates) {
    try {
      updates.preciseDurationSeconds = durationSecondsFromMinutes(updates.durationMinutes);
      delete updates.durationMinutes;
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Duração inválida." });
      return;
    }
  }

  const [substance] = await db.update(substancesTable).set(updates).where(eq(substancesTable.id, id)).returning();
  if (!substance) {
    res.status(404).json({ error: "Substance not found" });
    return;
  }

  res.json(formatSubstance(substance));
});

export default router;
