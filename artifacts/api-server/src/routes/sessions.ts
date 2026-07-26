import { Router, type IRouter } from "express";
import { moduleGuard } from "../middleware/moduleGuard";
import { eq, and } from "drizzle-orm";
import { resolveEmpresaId } from "../middleware/tenantContext";
import { db, sessionsTable, substanceApplicationsTable, clientsTable, professionalsTable, substancesTable, protocolsTable } from "@workspace/db";
import { buildVCalendar, durationFromProcedureTypes, type IcsEventInput } from "../lib/ics";
import {
  ListSessionsQueryParams,
  CreateSessionBody,
  GetSessionParams,
  UpdateSessionParams,
  UpdateSessionBody,
  ConfirmSubstanceApplicationParams,
  ConfirmSubstanceApplicationBody,
} from "@workspace/api-zod";

const router: IRouter = Router();
router.use(moduleGuard("agenda"));

async function buildSessionResponse(session: typeof sessionsTable.$inferSelect) {
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, session.clientId));
  const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, session.protocolId));

  let professionalName: string | null = null;
  if (session.professionalId) {
    const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, session.professionalId));
    professionalName = prof?.name ?? null;
  }

  // Enfermeira: prioridade do campo da sessão; fallback no protocolo.
  const resolvedNurseId = session.nurseId ?? (protocol as any)?.nurseId ?? null;
  let nurseName: string | null = null;
  if (resolvedNurseId) {
    const [nurse] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, resolvedNurseId));
    nurseName = nurse?.name ?? null;
  }

  const applications = await db.select().from(substanceApplicationsTable).where(eq(substanceApplicationsTable.sessionId, session.id));

  const substanceMap: Record<number, typeof substancesTable.$inferSelect> = {};
  for (const app of applications) {
    if (!substanceMap[app.substanceId]) {
      const [s] = await db.select().from(substancesTable).where(eq(substancesTable.id, app.substanceId));
      if (s) substanceMap[app.substanceId] = s;
    }
  }

  return {
    id: session.id,
    protocolId: session.protocolId,
    protocolTitle: protocol?.title ?? null,
    clientId: session.clientId,
    clientName: client?.name ?? "",
    clientCpf: client?.cpf ?? "",
    clientEmail: client?.email ?? null,
    clientPhone: (client as any)?.phone ?? null,
    scheduledDate: session.scheduledDate,
    scheduledTime: session.scheduledTime,
    status: session.status,
    professionalId: session.professionalId ?? null,
    professionalName,
    nurseId: resolvedNurseId,
    nurseName,
    serviceAddress: (session as any).serviceAddress ?? null,
    unit: session.unit ?? null,
    serviceType: session.serviceType,
    weekNumber: session.weekNumber,
    notes: session.notes ?? null,
    substanceApplications: applications.map(app => ({
      id: app.id,
      substanceId: app.substanceId,
      substanceName: substanceMap[app.substanceId]?.name ?? "",
      substanceColor: substanceMap[app.substanceId]?.color ?? "#888888",
      dose: app.dose,
      procedureType: substanceMap[app.substanceId]?.procedureType ?? "iv",
      sessionNumber: app.sessionNumber,
      totalSessions: app.totalSessions,
      status: app.status,
      availability: app.availability,
      appliedAt: app.appliedAt ?? null,
      notes: app.notes ?? null,
    })),
    createdAt: session.createdAt.toISOString(),
  };
}

// Converte a resposta de sessão para a entrada do motor único de .ics (lib/ics.ts).
// Duração correta por tipo (IV 30 / IM 15 / Implante 60) somando os tipos das
// substâncias DISP desta ida; fallback para a duração mínima do motor.
export function sessionToIcsInput(
  session: Awaited<ReturnType<typeof buildSessionResponse>>,
  sequence?: number,
): IcsEventInput {
  const dispApps = session.substanceApplications.filter(a => a.availability === "disp");
  const proxApps = session.substanceApplications.filter(a => a.availability === "prox");

  const dispLines = dispApps
    .filter(a => a.sessionNumber > 0)
    .map(a => `${a.substanceName} ${a.sessionNumber}/${a.totalSessions} (DISP)`);
  const proxLines = proxApps.map(a => `${a.substanceName} (PROX)`);
  const descriptionLines = [...dispLines, ...proxLines];

  const durationMinutes = durationFromProcedureTypes(dispApps.map(a => a.procedureType));

  return {
    sessionId: session.id,
    clientName: session.clientName,
    scheduledDate: session.scheduledDate,
    scheduledTime: session.scheduledTime,
    weekNumber: session.weekNumber,
    unit: session.unit,
    status: session.status,
    durationMinutes,
    descriptionLines,
    sequence,
  };
}

router.get("/sessions", async (req, res): Promise<void> => {
  const query = ListSessionsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const empresaId = resolveEmpresaId(req);
  let sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.empresaId, empresaId));

  if (query.data.clientId) sessions = sessions.filter(s => s.clientId === query.data.clientId);
  if (query.data.protocolId) sessions = sessions.filter(s => s.protocolId === query.data.protocolId);
  if (query.data.status) sessions = sessions.filter(s => s.status === query.data.status);
  if (query.data.professionalId) sessions = sessions.filter(s => s.professionalId === query.data.professionalId);
  if (query.data.dateFrom) sessions = sessions.filter(s => s.scheduledDate >= query.data.dateFrom!);
  if (query.data.dateTo) sessions = sessions.filter(s => s.scheduledDate <= query.data.dateTo!);

  const results = await Promise.all(sessions.map(buildSessionResponse));
  res.json(results);
});

// ICS download for a range of sessions
router.get("/sessions/ics", async (req, res): Promise<void> => {
  const { dateFrom, dateTo, professionalId, clientId, protocolId } = req.query as Record<string, string>;

  let sessions = await db.select().from(sessionsTable);

  if (dateFrom) sessions = sessions.filter(s => s.scheduledDate >= dateFrom);
  if (dateTo) sessions = sessions.filter(s => s.scheduledDate <= dateTo);
  if (professionalId) sessions = sessions.filter(s => s.professionalId === parseInt(professionalId));
  if (clientId) sessions = sessions.filter(s => s.clientId === parseInt(clientId));
  if (protocolId) sessions = sessions.filter(s => s.protocolId === parseInt(protocolId));

  sessions.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.scheduledTime.localeCompare(b.scheduledTime));

  const results = await Promise.all(sessions.map(buildSessionResponse));

  const icsContent = buildVCalendar(results.map(s => sessionToIcsInput(s)));
  const label = dateFrom && dateTo ? `${dateFrom}_a_${dateTo}` : "agenda";
  const filename = `paxter_${label}.ics`;

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(icsContent);
});

// Single session ICS
router.get("/sessions/:id/ics", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, id));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const result = await buildSessionResponse(session);

  const icsContent = buildVCalendar([sessionToIcsInput(result)]);
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, session.clientId));
  const clientSlug = client?.name?.replace(/\s+/g, "_") ?? "cliente";
  const filename = `paxter_sessao_${id}_${clientSlug}.ics`;

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(icsContent);
});

router.post("/sessions", async (req, res): Promise<void> => {
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const empresaId = resolveEmpresaId(req);
  const [session] = await db.insert(sessionsTable).values({ ...parsed.data, empresaId }).returning();
  const result = await buildSessionResponse(session);
  res.status(201).json(result);
});

router.get("/sessions/:id", async (req, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, params.data.id));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const result = await buildSessionResponse(session);
  res.json(result);
});

router.put("/sessions/:id", async (req, res): Promise<void> => {
  const params = UpdateSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [session] = await db.update(sessionsTable).set(parsed.data).where(eq(sessionsTable.id, params.data.id)).returning();
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const result = await buildSessionResponse(session);
  res.json(result);
});

router.post("/sessions/:id/confirm-substance", async (req, res): Promise<void> => {
  const params = ConfirmSubstanceApplicationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = ConfirmSubstanceApplicationBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, params.data.id));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const applications = await db.select().from(substanceApplicationsTable)
    .where(eq(substanceApplicationsTable.sessionId, params.data.id));

  const targetApp = applications.find(a => a.substanceId === body.data.substanceId && a.availability === "disp");
  if (!targetApp) {
    res.status(404).json({ error: "Substance application not found in this session" });
    return;
  }

  await db.update(substanceApplicationsTable)
    .set({
      status: body.data.confirmed ? "applied" : "missed",
      appliedAt: body.data.confirmed ? new Date().toISOString() : null,
      notes: body.data.notes ?? null,
    })
    .where(eq(substanceApplicationsTable.id, targetApp.id));

  const updatedApps = await db.select().from(substanceApplicationsTable)
    .where(eq(substanceApplicationsTable.sessionId, params.data.id));

  const dispApps = updatedApps.filter(a => a.availability === "disp");
  const allDone = dispApps.every(a => a.status === "applied" || a.status === "missed");

  if (allDone && dispApps.length > 0) {
    await db.update(sessionsTable).set({ status: "completed" }).where(eq(sessionsTable.id, params.data.id));
  }

  const result = await buildSessionResponse(session);
  res.json(result);
});

export default router;
