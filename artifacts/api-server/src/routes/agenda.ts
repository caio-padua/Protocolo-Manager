import { Router, type IRouter, type Response } from "express";
import { moduleGuard } from "../middleware/moduleGuard";
import { agendaWriteGuard } from "../lib/agenda-governance";
import { canonicalWindows, validWindowRecurrence } from "../lib/agenda-window-recurrence";
import { requireCollaborator } from "./collaborator";
import { eq, and, or, isNull, sql, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  agendaResourcesTable,
  agendaWindowsTable,
  agendaExceptionsTable,
  agendaSettingsTable,
  locationsTable,
} from "@workspace/db";
import {
  computeResourceSlots,
  bookSession,
  cancelBooking,
  clearSimulations,
} from "../lib/agenda-booking.js";

const router: IRouter = Router();
router.use(moduleGuard("agenda"));
router.use(agendaWriteGuard);

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
  repeatWeeks: z.union([z.literal(1), z.literal(2)]).optional(),
  anchorDate: z.string().nullable().optional(),
});
const replaceWindowsSchema = z.object({ windows: z.array(windowSchema), expectedWindows: z.array(windowSchema).optional() });

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

// Calendarios da conta Google da clinica (clinica.padua.agenda@gmail.com) por papel+modalidade.
const CAL_ENFERMAGEM_LOCAL = "725448b07b742a3022b74e566c86ae646a7389a52a862c6cf8bda4e45df36037@group.calendar.google.com";
const CAL_ENFERMAGEM_REMOTO = "65fbeb905e7ed638c1b44ddf8378e8c112865f0d5225e5a244c7f9f566ec6841@group.calendar.google.com";
const CAL_MEDICO_LOCAL = "146251b9421c476ed8fb0cc915a5537b08aec836b12923d7ba2105c4cac80751@group.calendar.google.com";
const CAL_MEDICO_REMOTO = "5b85fa12fb9ee122a815921c838d9df16c789985b93b9921fd94e1571f36eb7c@group.calendar.google.com";

const DEFAULT_RESOURCES = [
  { name: "Enfermeira Domiciliar", kind: "enfermagem", modality: "domiciliar", color: "#45B8CC", sortOrder: 0, googleCalendarId: CAL_ENFERMAGEM_REMOTO },
  { name: "Enfermeira Local", kind: "enfermagem", modality: "local", color: "#3D7A7A", sortOrder: 1, googleCalendarId: CAL_ENFERMAGEM_LOCAL },
  { name: "Médico Local", kind: "medico", modality: "local", color: "#2F6060", sortOrder: 2, googleCalendarId: CAL_MEDICO_LOCAL },
  { name: "Médico Online", kind: "medico", modality: "online", color: "#5BC8B0", sortOrder: 3, googleCalendarId: CAL_MEDICO_REMOTO },
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
  if (existing.length > 0) {
    // Backfill idempotente do calendario Google por nome do recurso (recursos legados sem vinculo).
    for (const r of DEFAULT_RESOURCES) {
      const match = existing.find((e) => e.name === r.name);
      if (match?.active && !match.googleCalendarId) {
        await db.update(agendaResourcesTable)
          .set({ googleCalendarId: r.googleCalendarId })
          .where(eq(agendaResourcesTable.id, match.id));
      }
    }
    return;
  }
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
router.get("/agenda/resources", async (req, res): Promise<void> => {
  await ensureSeed();
  const rows = await db.select().from(agendaResourcesTable).where(and(
    eq(agendaResourcesTable.active, true),
    inArray(agendaResourcesTable.locationId,db.select({id:locationsTable.id}).from(locationsTable)
      .where(eq(locationsTable.empresaId,req.tenantContext.empresaId ?? -1))),
  )).orderBy(agendaResourcesTable.sortOrder);
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
  const [updated] = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(19872026,${req.tenantContext.empresaId!})`);
    return tx.update(agendaResourcesTable).set(updates).where(eq(agendaResourcesTable.id, id)).returning();
  });
  if (!updated) {
    res.status(404).json({ error: "Recurso não encontrado" });
    return;
  }
  res.json(updated);
});

// ---- Janelas ----
router.get("/agenda/resources/:id/windows", requireCollaborator, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  if (!req.tenantContext?.authenticated || req.tenantContext.professionalId !== req.collaborator?.professionalId) {
    res.status(401).json({ error: "Entre com seu acesso profissional." }); return;
  }
  const owner = await db.select({ id: agendaResourcesTable.id }).from(agendaResourcesTable)
    .innerJoin(locationsTable, eq(agendaResourcesTable.locationId, locationsTable.id))
    .where(and(eq(agendaResourcesTable.id, id), eq(locationsTable.empresaId, req.tenantContext.empresaId)));
  if (!owner.length) { res.status(404).json({ error: "Recurso não encontrado." }); return; }
  const rows = await db.select().from(agendaWindowsTable).where(and(
    eq(agendaWindowsTable.resourceId, id), eq(agendaWindowsTable.active, true),
  ));
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
  if (!data.expectedWindows) {
    res.status(409).json({ error: "Atualize a tela e confira o expediente antes de salvar." });
    return;
  }
  for (const w of windows) {
    if (w.endTime <= w.startTime) {
      res.status(400).json({ error: `janela com fim <= início (${w.startTime}-${w.endTime})` });
      return;
    }
    if (!validWindowRecurrence(w.weekday, w.repeatWeeks ?? 1, w.anchorDate ?? null)) {
      res.status(400).json({ error: "Informe uma data inicial válida no mesmo dia da semana para a repetição quinzenal." });
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

  const saved = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(19872026,${req.tenantContext.empresaId!})`);
    const old = await tx.select().from(agendaWindowsTable).where(and(
      eq(agendaWindowsTable.resourceId, id), eq(agendaWindowsTable.active, true),
    ));
    if (JSON.stringify(canonicalWindows(old)) !== JSON.stringify(canonicalWindows(data.expectedWindows!)) ||
        (old.some(w => w.repeatWeeks === 2) && windows.some(w => w.repeatWeeks === undefined))) {
      return false;
    }
    await tx.update(agendaWindowsTable).set({ active: false }).where(and(
      eq(agendaWindowsTable.resourceId, id), eq(agendaWindowsTable.active, true),
    ));
    if (windows.length > 0) {
      await tx.insert(agendaWindowsTable).values(windows.map(w => ({
        resourceId: id, weekday: w.weekday, startTime: w.startTime, endTime: w.endTime,
        repeatWeeks: w.repeatWeeks ?? 1, anchorDate: w.anchorDate ?? null, active: true,
      })));
    }
    return true;
  });
  if (!saved) {
    res.status(409).json({ error: "Atualize a tela antes de alterar janelas quinzenais." });
    return;
  }
  const rows = await db.select().from(agendaWindowsTable).where(and(
    eq(agendaWindowsTable.resourceId, id), eq(agendaWindowsTable.active, true),
  ));
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
  const owner = await db.select({ id: agendaResourcesTable.id }).from(agendaResourcesTable)
    .innerJoin(locationsTable, eq(agendaResourcesTable.locationId, locationsTable.id))
    .where(and(eq(agendaResourcesTable.id, resourceId), eq(locationsTable.empresaId, req.tenantContext.empresaId ?? -1)));
  if (!owner.length) { res.status(404).json({ error: "Recurso não encontrado." }); return; }

  // Ocupacao: por padrao vem das sessoes REAIS marcadas neste recurso+data (F2.3).
  // O parametro `occupied` (CSV HH:mm) e um OVERRIDE para a Prova Viva demonstrar a liberacao em cadeia.
  const occupiedParam = String(req.query.occupied ?? "").trim();
  let override: Set<string> | null = null;
  if (occupiedParam) {
    override = new Set<string>(
      occupiedParam
        .split(",")
        .map((s) => s.trim())
        .filter((s) => HHMM.test(s)),
    );
  }

  const computed = await computeResourceSlots(resourceId, date, override);
  if (!computed) {
    res.status(404).json({ error: "Recurso não encontrado" });
    return;
  }

  res.json({
    resourceId,
    date,
    reason: computed.result.reason,
    subBlocks: computed.result.subBlocks,
    slots: computed.result.slots,
  });
});

// ---- Marcacao real (F2.3 recepcao) ----
const bookSchema = z.object({
  resourceId: z.number().int().positive(),
  clientId: z.number().int().positive(),
  protocolId: z.number().int().positive(),
  date: z.string().regex(ISO_DATE, "date inválida (YYYY-MM-DD)"),
  time: z.string().regex(HHMM, "horário inválido (HH:mm)"),
  serviceType: z.string().trim().max(40).optional(),
  unit: z.string().trim().max(200).optional(),
  syncGoogle: z.boolean().optional(),
  simulate: z.boolean().optional(),
});

router.post("/agenda/book", async (req, res): Promise<void> => {
  const data = parseOr400(bookSchema, req.body, res);
  if (!data) return;
  const r = await bookSession({
    resourceId: data.resourceId,
    clientId: data.clientId,
    protocolId: data.protocolId,
    date: data.date,
    time: data.time,
    serviceType: data.serviceType,
    unit: data.unit,
    syncGoogle: data.syncGoogle ?? false,
    simulate: data.simulate ?? false,
    empresaId: req.tenantContext.empresaId ?? undefined,
  });
  if (!r.ok) {
    res.status(r.status).json({ error: r.error });
    return;
  }
  res.status(201).json({ session: r.session, googleEventId: r.googleEventId ?? null, googleSyncWarning: r.googleSyncWarning });
});

router.delete("/agenda/book/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const r = await cancelBooking(id, req.tenantContext.empresaId ?? -1);
  if (!r.ok) {
    res.status(r.status).json({ error: r.error });
    return;
  }
  res.json({ session: r.session, ...(r.googleSyncWarning ? { googleSyncWarning: r.googleSyncWarning } : {}) });
});

const limparSchema = z.object({
  clientId: z.number().int().positive().optional(),
  protocolId: z.number().int().positive().optional(),
});

router.post("/agenda/limpar-simulacao", requireCollaborator, async (req, res): Promise<void> => {
  const parsed = limparSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "Filtro inválido." }); return; }
  const r = await clearSimulations({ ...parsed.data, empresaId: req.tenantContext.empresaId ?? -1 });
  res.json(r);
});

export default router;
