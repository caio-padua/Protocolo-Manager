import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, rasTable, sessionsTable, substanceApplicationsTable, substancesTable, professionalsTable, clientsTable } from "@workspace/db";
import {
  ListRASQueryParams,
  CreateRASBody,
  GetRASParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatRAS(r: typeof rasTable.$inferSelect) {
  return {
    ...r,
    professionalCrm: r.professionalCrm ?? null,
    observations: r.observations ?? null,
    substances: r.substances as Array<{ substanceName: string; dose: string; route: string; sessionNumber: number; totalSessions: number; lot: string | null; validity: string | null; appliedAt: string | null; status: string }>,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/ras", async (req, res): Promise<void> => {
  const query = ListRASQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  let rasRecords = await db.select().from(rasTable);
  if (query.data.clientId) rasRecords = rasRecords.filter(r => r.clientId === query.data.clientId);
  if (query.data.protocolId) rasRecords = rasRecords.filter(r => r.protocolId === query.data.protocolId);

  res.json(rasRecords.map(formatRAS));
});

router.post("/ras", async (req, res): Promise<void> => {
  const parsed = CreateRASBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, parsed.data.sessionId));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, session.clientId));

  let professionalName = "Profissional";
  let professionalCrm: string | null = null;
  if (session.professionalId) {
    const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, session.professionalId));
    if (prof) {
      professionalName = prof.name;
      professionalCrm = prof.crm ?? null;
    }
  }

  const applications = await db.select().from(substanceApplicationsTable)
    .where(eq(substanceApplicationsTable.sessionId, session.id));

  const dispApps = applications.filter(a => a.availability === "disp" && a.sessionNumber > 0);

  const substanceMap: Record<number, typeof substancesTable.$inferSelect> = {};
  for (const app of dispApps) {
    if (!substanceMap[app.substanceId]) {
      const [s] = await db.select().from(substancesTable).where(eq(substancesTable.id, app.substanceId));
      if (s) substanceMap[app.substanceId] = s;
    }
  }

  const substances = dispApps.map(app => ({
    substanceName: substanceMap[app.substanceId]?.name ?? "Substância",
    dose: app.dose,
    route: "IV",
    sessionNumber: app.sessionNumber,
    totalSessions: app.totalSessions,
    lot: null,
    validity: null,
    appliedAt: app.appliedAt ?? null,
    status: app.status,
  }));

  const [ras] = await db.insert(rasTable).values({
    sessionId: parsed.data.sessionId,
    protocolId: session.protocolId,
    clientId: session.clientId,
    clientName: client?.name ?? "",
    clientCpf: client?.cpf ?? "",
    professionalName,
    professionalCrm,
    unit: session.unit ?? "Clínica Principal",
    serviceDate: session.scheduledDate,
    serviceType: session.serviceType,
    substances,
    observations: parsed.data.observations ?? null,
    patientSignature: false,
    professionalSignature: false,
  }).returning();

  res.status(201).json(formatRAS(ras));
});

router.get("/ras/:id", async (req, res): Promise<void> => {
  const params = GetRASParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [ras] = await db.select().from(rasTable).where(eq(rasTable.id, params.data.id));
  if (!ras) {
    res.status(404).json({ error: "RAS not found" });
    return;
  }

  res.json(formatRAS(ras));
});

export default router;
