import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, locationsTable, locationProfessionalsTable, professionalsTable, sessionsTable } from "@workspace/db";

const router: IRouter = Router();

function normalizePhone(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s.startsWith("+")) {
    const digits = s.slice(1).replace(/\D/g, "");
    return digits ? "+" + digits : s; // fallback literal (caso extremo 3)
  }
  const digits = s.replace(/\D/g, "");
  if (!digits) return s; // sem dígitos -> preserva o que foi digitado (não bloquear)
  // Heurística Brasil: 10 ou 11 dígitos sem DDI -> prefixa +55
  if (digits.length === 10 || digits.length === 11) return "+55" + digits;
  return "+" + digits;
}

function serializeLocation(loc: typeof locationsTable.$inferSelect) {
  return {
    id: loc.id,
    name: loc.name,
    address: loc.address ?? null,
    type: loc.type,
    color: loc.color,
    active: loc.active === "true",
    googleCalendarId: loc.googleCalendarId ?? null,
    phone: loc.phone ?? null,
    cep: loc.cep ?? null,
    logradouro: loc.logradouro ?? null,
    numero: loc.numero ?? null,
    complemento: loc.complemento ?? null,
    bairro: loc.bairro ?? null,
    cidade: loc.cidade ?? null,
    estado: loc.estado ?? null,
    zona: loc.zona ?? null,
    createdAt: loc.createdAt.toISOString(),
  };
}

router.get("/locations", async (_req, res): Promise<void> => {
  const locations = await db.select().from(locationsTable).orderBy(locationsTable.name);

  const result = await Promise.all(locations.map(async (loc) => {
    const links = await db.select().from(locationProfessionalsTable)
      .where(eq(locationProfessionalsTable.locationId, loc.id));

    const professionals = await Promise.all(links.map(async (link) => {
      const [prof] = await db.select().from(professionalsTable)
        .where(eq(professionalsTable.id, link.professionalId));
      return prof ? { id: prof.id, name: prof.name, specialty: prof.specialty ?? null, role: link.role } : null;
    }));

    return {
      ...serializeLocation(loc),
      professionals: professionals.filter(Boolean),
    };
  }));

  res.json(result);
});

router.post("/locations", async (req, res): Promise<void> => {
  const { name, address, type, color, googleCalendarId, phone, cep, logradouro, numero, complemento, bairro, cidade, estado, zona } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const [loc] = await db.insert(locationsTable).values({
    name,
    address: address ?? null,
    type: type ?? "clinic",
    color: color ?? "#3B82F6",
    googleCalendarId: googleCalendarId ?? null,
    phone: normalizePhone(phone),
    cep: cep ?? null,
    logradouro: logradouro ?? null,
    numero: numero ?? null,
    complemento: complemento ?? null,
    bairro: bairro ?? null,
    cidade: cidade ?? null,
    estado: estado ?? null,
    zona: zona ?? null,
  }).returning();

  res.status(201).json(serializeLocation(loc));
});

router.put("/locations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { name, address, type, color, googleCalendarId, active, phone, cep, logradouro, numero, complemento, bairro, cidade, estado, zona } = req.body;
  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (address !== undefined) updates.address = address;
  if (type !== undefined) updates.type = type;
  if (color !== undefined) updates.color = color;
  if (googleCalendarId !== undefined) updates.googleCalendarId = googleCalendarId;
  if (active !== undefined) updates.active = String(active);
  if (phone !== undefined) updates.phone = normalizePhone(phone);
  if (cep !== undefined) updates.cep = cep ?? null;
  if (logradouro !== undefined) updates.logradouro = logradouro ?? null;
  if (numero !== undefined) updates.numero = numero ?? null;
  if (complemento !== undefined) updates.complemento = complemento ?? null;
  if (bairro !== undefined) updates.bairro = bairro ?? null;
  if (cidade !== undefined) updates.cidade = cidade ?? null;
  if (estado !== undefined) updates.estado = estado ?? null;
  if (zona !== undefined) updates.zona = zona ?? null;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db.update(locationsTable).set(updates).where(eq(locationsTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Location not found" });
    return;
  }
  res.json(serializeLocation(updated));
});

router.delete("/locations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [loc] = await db.select().from(locationsTable).where(eq(locationsTable.id, id));
  if (!loc) {
    res.status(404).json({ error: "Location not found" });
    return;
  }
  // Trava: não apagar clínica com sessões vinculadas (vínculo por nome em sessions.unit)
  const linkedSessions = await db.select({ id: sessionsTable.id }).from(sessionsTable)
    .where(eq(sessionsTable.unit, loc.name));
  if (linkedSessions.length > 0) {
    res.status(409).json({
      error: "Clínica possui sessões vinculadas. Desative-a (active=false) em vez de apagar.",
      sessions: linkedSessions.length,
    });
    return;
  }
  await db.delete(locationProfessionalsTable).where(eq(locationProfessionalsTable.locationId, id));
  await db.delete(locationsTable).where(eq(locationsTable.id, id));
  res.json({ ok: true, deleted: id });
});

router.post("/locations/:id/professionals", async (req, res): Promise<void> => {
  const locationId = parseInt(req.params.id);
  const { professionalId, role } = req.body;
  if (!professionalId) {
    res.status(400).json({ error: "professionalId is required" });
    return;
  }
  const [link] = await db.insert(locationProfessionalsTable).values({
    locationId,
    professionalId: parseInt(professionalId),
    role: role ?? "executor",
  }).returning();
  res.status(201).json(link);
});

export default router;
