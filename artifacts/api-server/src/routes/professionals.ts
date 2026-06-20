import { Router, type IRouter } from "express";
import { db, professionalsTable, locationProfessionalsTable, sessionsTable, locationsTable, agendaCalendarsTable } from "@workspace/db";
import { CreateProfessionalBody } from "@workspace/api-zod";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

const CATEGORIES = ["medico", "enfermagem", "recepcao", "administrativo", "financeiro", "outro"] as const;
type Category = (typeof CATEGORIES)[number];

function normalizeCategory(raw: unknown): Category {
  const s = String(raw ?? "").trim().toLowerCase();
  return (CATEGORIES as readonly string[]).includes(s) ? (s as Category) : "outro";
}

function formatProfessional(p: typeof professionalsTable.$inferSelect) {
  return {
    ...p,
    crm: p.crm ?? null,
    specialty: p.specialty ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
    unit: p.unit ?? null,
    serviceTypes: p.serviceTypes ?? ["clinic"],
    category: p.category ?? "outro",
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/professionals", async (_req, res): Promise<void> => {
  const professionals = await db.select().from(professionalsTable);
  res.json(professionals.map(formatProfessional));
});

router.post("/professionals", async (req, res): Promise<void> => {
  // Categoria fora da lista -> 400 (caso extremo 4).
  if (req.body?.category !== undefined && req.body?.category !== null) {
    const s = String(req.body.category).trim().toLowerCase();
    if (!(CATEGORIES as readonly string[]).includes(s)) {
      res.status(400).json({ error: `Categoria inválida. Use uma de: ${CATEGORIES.join(", ")}` });
      return;
    }
  }
  const parsed = CreateProfessionalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const values = {
    ...parsed.data,
    category: normalizeCategory(parsed.data.category),
  };
  const [professional] = await db.insert(professionalsTable).values(values).returning();
  res.status(201).json(formatProfessional(professional));
});

router.put("/professionals/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  const [row] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Profissional não encontrado" });
    return;
  }

  const { name, crm, specialty, email, phone, unit, serviceTypes, category, role, active } = req.body as {
    name?: string;
    crm?: string | null;
    specialty?: string | null;
    email?: string | null;
    phone?: string | null;
    unit?: string | null;
    serviceTypes?: string[];
    category?: string;
    role?: string;
    active?: boolean;
  };

  if (name !== undefined && !String(name).trim()) {
    res.status(400).json({ error: "Nome não pode ficar vazio" });
    return;
  }
  if (category !== undefined && category !== null) {
    const s = String(category).trim().toLowerCase();
    if (!(CATEGORIES as readonly string[]).includes(s)) {
      res.status(400).json({ error: `Categoria inválida. Use uma de: ${CATEGORIES.join(", ")}` });
      return;
    }
  }

  const [updated] = await db
    .update(professionalsTable)
    .set({
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(crm !== undefined ? { crm } : {}),
      ...(specialty !== undefined ? { specialty } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(unit !== undefined ? { unit } : {}),
      ...(serviceTypes !== undefined ? { serviceTypes } : {}),
      ...(category !== undefined ? { category: normalizeCategory(category) } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(active !== undefined ? { active: !!active } : {}),
    })
    .where(eq(professionalsTable.id, id))
    .returning();
  res.json(formatProfessional(updated));
});

router.delete("/professionals/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  const [row] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Profissional não encontrado" });
    return;
  }

  // Trava: não apagar profissional com sessões vinculadas (caso extremo 2).
  const linkedSessions = await db.select().from(sessionsTable).where(eq(sessionsTable.professionalId, id));
  if (linkedSessions.length > 0) {
    res.status(409).json({
      error: `Profissional tem ${linkedSessions.length} sessão(ões) vinculada(s). Desative-o em vez de apagar.`,
    });
    return;
  }

  // Limpa vínculos com clínicas antes de apagar (não há sessões em risco).
  await db.delete(locationProfessionalsTable).where(eq(locationProfessionalsTable.professionalId, id));
  await db.delete(professionalsTable).where(eq(professionalsTable.id, id));
  res.json({ success: true });
});

// ---- Vínculos profissional <-> clínica <-> agenda Google (location_professionals) ----

router.get("/professionals/:id/locations", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  const links = await db
    .select()
    .from(locationProfessionalsTable)
    .where(eq(locationProfessionalsTable.professionalId, id));
  res.json(
    links.map((l) => ({
      id: l.id,
      locationId: l.locationId,
      professionalId: l.professionalId,
      role: l.role,
      agendaCalendarId: l.agendaCalendarId ?? null,
    })),
  );
});

// Cria ou atualiza o vínculo (par profissional+clínica), incluindo a agenda Google preferida.
router.post("/professionals/:id/locations", async (req, res): Promise<void> => {
  const professionalId = parseInt(req.params.id);
  if (isNaN(professionalId)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  const { locationId, agendaCalendarId, role } = req.body as {
    locationId?: number;
    agendaCalendarId?: number | null;
    role?: string;
  };
  if (typeof locationId !== "number") {
    res.status(400).json({ error: "locationId é obrigatório" });
    return;
  }

  // Integridade do vínculo (SUB-03 architect, achado HIGH):
  // profissional e clínica devem existir; a agenda escolhida deve existir,
  // estar ativa e pertencer à MESMA clínica (ou ser global, locationId=null),
  // senão o evento da sessão cairia no calendário de outra clínica.
  const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, professionalId));
  if (!prof) {
    res.status(404).json({ error: "Profissional não encontrado" });
    return;
  }
  const [loc] = await db.select().from(locationsTable).where(eq(locationsTable.id, locationId));
  if (!loc) {
    res.status(404).json({ error: "Clínica não encontrada" });
    return;
  }
  if (agendaCalendarId !== undefined && agendaCalendarId !== null) {
    const [cal] = await db.select().from(agendaCalendarsTable).where(eq(agendaCalendarsTable.id, agendaCalendarId));
    if (!cal) {
      res.status(404).json({ error: "Agenda não encontrada" });
      return;
    }
    if (!cal.active) {
      res.status(400).json({ error: "Agenda está inativa" });
      return;
    }
    if (cal.locationId !== null && cal.locationId !== locationId) {
      res.status(400).json({ error: "A agenda escolhida pertence a outra clínica" });
      return;
    }
  }

  const [existing] = await db
    .select()
    .from(locationProfessionalsTable)
    .where(
      and(
        eq(locationProfessionalsTable.professionalId, professionalId),
        eq(locationProfessionalsTable.locationId, locationId),
      ),
    );

  if (existing) {
    const [updated] = await db
      .update(locationProfessionalsTable)
      .set({
        ...(agendaCalendarId !== undefined ? { agendaCalendarId: agendaCalendarId } : {}),
        ...(role !== undefined ? { role } : {}),
      })
      .where(eq(locationProfessionalsTable.id, existing.id))
      .returning();
    res.json(updated);
    return;
  }

  const [created] = await db
    .insert(locationProfessionalsTable)
    .values({
      locationId,
      professionalId,
      role: role ?? "executor",
      agendaCalendarId: agendaCalendarId ?? null,
    })
    .returning();
  res.status(201).json(created);
});

router.delete("/professionals/:id/locations/:locationId", async (req, res): Promise<void> => {
  const professionalId = parseInt(req.params.id);
  const locationId = parseInt(req.params.locationId);
  if (isNaN(professionalId) || isNaN(locationId)) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  await db
    .delete(locationProfessionalsTable)
    .where(
      and(
        eq(locationProfessionalsTable.professionalId, professionalId),
        eq(locationProfessionalsTable.locationId, locationId),
      ),
    );
  res.json({ success: true });
});

export default router;
