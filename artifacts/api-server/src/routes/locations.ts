import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, locationsTable, locationProfessionalsTable, professionalsTable } from "@workspace/db";

const router: IRouter = Router();

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
      id: loc.id,
      name: loc.name,
      address: loc.address ?? null,
      type: loc.type,
      color: loc.color,
      active: loc.active === "true",
      googleCalendarId: loc.googleCalendarId ?? null,
      professionals: professionals.filter(Boolean),
      createdAt: loc.createdAt.toISOString(),
    };
  }));

  res.json(result);
});

router.post("/locations", async (req, res): Promise<void> => {
  const { name, address, type, color, googleCalendarId } = req.body;
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
  }).returning();

  res.status(201).json({ ...loc, active: loc.active === "true", createdAt: loc.createdAt.toISOString() });
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
