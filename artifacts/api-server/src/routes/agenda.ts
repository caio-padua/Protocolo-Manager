import { Router, type IRouter, type Response } from "express";
import { eq, and, or, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  agendaResourcesTable,
  agendaWindowsTable,
  agendaExceptionsTable,
  agendaSettingsTable,
} from "@workspace/db";
import { computeAgendaSlots } from "../lib/agenda-motor.js";

const router: IRouter = Router();

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RESOURCE_KIND = ["enfermagem", "medico"] as const;
const MODALITY = ["domiciliar", "local", "online"] as const;
const EXCEPTION_KIND = ["feriado", "bloqueio"] as const;

const createResourceSchema = z.object({
  name: z.string().trim().min(1, "name é obrigatório").max(200),
  kind: z.enum(RESOURCE_KIND),
  modality: z.enum(MODALITY),
  color: z.string().trim().max(20).optional(),
  slotMinutes: z.number().int().min(5).max(480).optional(),
  professionalId: z.number().int().nullable().optional(),
  locationId: z.number().int().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const updateResourceSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    kind: z.enum(RESOURCE_KIND),
    modality: z.enum(MODALITY),
    color: z.string().trim().max(20),
    slotMinutes: z.number().int().min(5).max(480),
    professionalId: z.number().int().nullable(),
    locationId: z.number().int().nullable(),
    active: z.boolean(),
    sortOrder: z.number().int().min(0),
  })
  .partial();

const windowSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(HHMM, "horário inválido (HH:mm)"),
  endTime: z.string().regex(HHMM, "horário inválido (HH:mm)"),
});
const replaceWindowsSchema = z.object({ windows: z.array(windowSchema) });

const createExceptionSchema = z.object({
  resourceId: z.number().int().nullable().optional(),
  date: z.string().regex(ISO_DATE, "date inválida (YYYY-MM-DD)"),
  kind: z.enum(EXCEPTION_KIND),
  description: z.string().trim().max(500).nullable().optional(),
});

const updateSettingsSchema = z
  .object({
    blockMinutes: z.number().int().min(15).max(1440),
    triggerPercent: z.number().int().min(0).max(100),
    minLeadHours: z.number().int().min(0).max(8760),
  })
  .partial();

function parseOr400<T>(schema: z.ZodType<T>, body: unknown, res: Response): T | null {
  const r = schema.safeParse(body);
  if (!r.success) {
    res.status(400).json({ error: r.error.issues[0]?.message ?? "dados inválidos" });
    return null;
  }
  return r.data;
}

const DEFAULT_RESOURCES = [
  { name: "Enfermeira Domiciliar", kind: "enfermagem", modality: "domiciliar", color: "#45B8CC", sortOrder: 0 },
  { name: "Enfermeira Local", kind: "enfermagem", modality: "local", color: "#3D7A7A", sortOrder: 1 },
  { name: "Médico Local", kind: "medico", modality: "local", color: "#2F6060", sortOrder: 2 },
  { name: "Médico Online", kind: "medico", modality: "online", color: "#5BC8B0", sortOrder: 3 },
];

function defaultWindowsFor(resourceId: number) {
  const rows: { resourceId: number; weekday: number; startTime: string; endTime: string }[] = [];
  for (let weekday = 1; weekday <= 5; weekday++) {
    rows.push({ resourceId, weekday, startTime: "08:00", endTime: "12:00" });
    rows.push({ resourceId, weekday, startTime: "14:00", endTime: "20:00" });
  }
  rows.push({ resourceId, weekday: 6, startTime: "08:00", endTime: "12:00" });
  return rows;
}

async function ensureSeed(): Promise<void> {
  const existing = await db.select().from(agendaResourcesTable);
  if (existing.length > 0) return;
  for (const r of DEFAULT_RESOURCES) {
    const [created] = await db.insert(agendaResourcesTable).values(r).returning();
    await db.insert(agendaWindowsTable).values(defaultWindowsFor(created.id));
  }
}

async function ensureSettings() {
  const [row] = await db.select().from(agendaSettingsTable).orderBy(agendaSettingsTable.id).limit(1);
  if (row) return row;
  const [created] = await db.insert(agendaSettingsTable).values({}).returning();
  return created;
}

// ---- Recursos ----
router.get("/agenda/resources", async (_req, res): Promise<void> => {
  await ensureSeed();
  const rows = await db.select().from(agendaResourcesTable).orderBy(agendaResourcesTable.sortOrder);
  res.json(rows);
});

router.post("/agenda/resources", async (req, res): Promise<void> => {
  const data = parseOr400(createResourceSchema, req.body, res);
  if (!data) return;
  const [created] = await db
    .insert(agendaResourcesTable)
    .values({
      name: data.name,
      kind: data.kind,
      modality: data.modality,
      color: data.color ?? "#3D7A7A",
      slotMinutes: data.slotMinutes ?? 30,
      professionalId: data.professionalId ?? null,
      locationId: data.locationId ?? null,
      sortOrder: data.sortOrder ?? 0,
    })
    .returning();
  res.status(201).json(created);
});

router.put("/agenda/resources/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const data = parseOr400(updateResourceSchema, req.body, res);
  if (!data) return;
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) updates[k] = v;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Nenhum campo para atualizar" });
    return;
  }
  const [updated] = await db.update(agendaResourcesTable).set(updates).where(eq(agendaResourcesTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Recurso não encontrado" });
    return;
  }
  res.json(updated);
});

// ---- Janelas ----
router.get("/agenda/resources/:id/windows", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const rows = await db.select().from(agendaWindowsTable).where(eq(agendaWindowsTable.resourceId, id));
  res.json(rows);
});

router.put("/agenda/resources/:id/windows", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const data = parseOr400(replaceWindowsSchema, req.body, res);
  if (!data) return;
  const windows = data.windows;
  for (const w of windows) {
    if (w.endTime <= w.startTime) {
      res.status(400).json({ error: `janela com fim <= início (${w.startTime}-${w.endTime})` });
      return;
    }
  }
  // sobreposição no mesmo weekday
  const byDay: Record<number, { s: string; e: string }[]> = {};
  for (const w of windows) {
    (byDay[w.weekday] ||= []).push({ s: w.startTime, e: w.endTime });
  }
  for (const day of Object.keys(byDay)) {
    const arr = byDay[Number(day)].sort((a, b) => (a.s < b.s ? -1 : 1));
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].s < arr[i - 1].e) {
        res.status(400).json({ error: `janelas sobrepostas no dia ${day}` });
        return;
      }
    }
  }

  await db.delete(agendaWindowsTable).where(eq(agendaWindowsTable.resourceId, id));
  if (windows.length > 0) {
    await db.insert(agendaWindowsTable).values(
      windows.map((w) => ({
        resourceId: id,
        weekday: w.weekday,
        startTime: w.startTime,
        endTime: w.endTime,
      })),
    );
  }
  const rows = await db.select().from(agendaWindowsTable).where(eq(agendaWindowsTable.resourceId, id));
  res.json(rows);
});

// ---- Exceções ----
router.get("/agenda/exceptions", async (_req, res): Promise<void> => {
  const rows = await db.select().from(agendaExceptionsTable).orderBy(agendaExceptionsTable.date);
  res.json(rows);
});

router.post("/agenda/exceptions", async (req, res): Promise<void> => {
  const data = parseOr400(createExceptionSchema, req.body, res);
  if (!data) return;
  const [created] = await db
    .insert(agendaExceptionsTable)
    .values({
      resourceId: data.resourceId ?? null,
      date: data.date,
      kind: data.kind,
      description: data.description ?? null,
    })
    .returning();
  res.status(201).json(created);
});

router.delete("/agenda/exceptions/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  await db.delete(agendaExceptionsTable).where(eq(agendaExceptionsTable.id, id));
  res.status(204).end();
});

// ---- Settings (singleton) ----
router.get("/agenda/settings", async (_req, res): Promise<void> => {
  const row = await ensureSettings();
  res.json(row);
});

router.put("/agenda/settings", async (req, res): Promise<void> => {
  const data = parseOr400(updateSettingsSchema, req.body, res);
  if (!data) return;
  const current = await ensureSettings();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) updates[k] = v;
  }
  const [updated] = await db
    .update(agendaSettingsTable)
    .set(updates)
    .where(eq(agendaSettingsTable.id, current.id))
    .returning();
  res.json(updated);
});

// ---- Motor (anti-ilha) ----
router.get("/agenda/slots", async (req, res): Promise<void> => {
  const resourceId = parseInt(String(req.query.resourceId ?? ""), 10);
  const date = String(req.query.date ?? "");
  if (isNaN(resourceId) || !ISO_DATE.test(date)) {
    res.status(400).json({ error: "resourceId e date (YYYY-MM-DD) são obrigatórios" });
    return;
  }
  const [resource] = await db.select().from(agendaResourcesTable).where(eq(agendaResourcesTable.id, resourceId));
  if (!resource) {
    res.status(404).json({ error: "Recurso não encontrado" });
    return;
  }
  const settings = await ensureSettings();
  // weekday timezone-safe: meio-dia UTC evita qualquer borda de fuso (getUTCDay determinista).
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();

  const windows = await db
    .select()
    .from(agendaWindowsTable)
    .where(and(eq(agendaWindowsTable.resourceId, resourceId), eq(agendaWindowsTable.weekday, weekday)));

  const exceptions = await db
    .select()
    .from(agendaExceptionsTable)
    .where(
      and(
        eq(agendaExceptionsTable.date, date),
        or(isNull(agendaExceptionsTable.resourceId), eq(agendaExceptionsTable.resourceId, resourceId)),
      ),
    );

  // Ocupacao via query `occupied` (CSV HH:mm). A ocupacao REAL (sessao<->recurso) chega na marcacao (F2.3);
  // aqui o parametro serve a Prova Viva para demonstrar a liberacao em cadeia.
  const occupiedParam = String(req.query.occupied ?? "").trim();
  const occupiedTimes = new Set<string>(
    occupiedParam
      ? occupiedParam
          .split(",")
          .map((s) => s.trim())
          .filter((s) => HHMM.test(s))
      : [],
  );

  const result = computeAgendaSlots({
    windows: windows.map((w) => ({ startTime: w.startTime, endTime: w.endTime })),
    slotMinutes: resource.slotMinutes,
    settings: {
      blockMinutes: settings.blockMinutes,
      triggerPercent: settings.triggerPercent,
      minLeadHours: settings.minLeadHours,
    },
    occupiedTimes,
    now: new Date(),
    date,
    isException: exceptions.length > 0,
  });

  res.json({ resourceId, date, reason: result.reason, subBlocks: result.subBlocks, slots: result.slots });
});

export default router;
