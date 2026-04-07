import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, sessionsTable, substanceApplicationsTable, clientsTable, professionalsTable, substancesTable, protocolsTable } from "@workspace/db";
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

async function buildSessionResponse(session: typeof sessionsTable.$inferSelect) {
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, session.clientId));
  const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, session.protocolId));

  let professionalName: string | null = null;
  if (session.professionalId) {
    const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, session.professionalId));
    professionalName = prof?.name ?? null;
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

function buildICSEvent(session: Awaited<ReturnType<typeof buildSessionResponse>>): string[] {
  const lines: string[] = [];

  const dispApps = session.substanceApplications.filter(a => a.availability === "disp");
  const proxApps = session.substanceApplications.filter(a => a.availability === "prox");

  const dispLines = dispApps
    .filter(a => a.sessionNumber > 0)
    .map(a => `${a.substanceName} ${a.sessionNumber}/${a.totalSessions} (DISP)`)
    .join("\\n");

  const proxLines = proxApps
    .map(a => `${a.substanceName} (PROX)`)
    .join("\\n");

  const description = [dispLines, proxLines].filter(Boolean).join("\\n---\\n");

  const dateStr = session.scheduledDate.replace(/-/g, "");
  const [h, m] = session.scheduledTime.split(":").map(Number);
  const endH = String(h + 1).padStart(2, "0");
  const dtStart = `${dateStr}T${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}00`;
  const dtEnd = `${dateStr}T${endH}${String(m).padStart(2, "0")}00`;

  const uid = `padcom-session-${session.id}@padcom.clinic`;
  const summary = `PADCOM: ${session.clientName} — Semana ${session.weekNumber}`;

  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");

  lines.push("BEGIN:VEVENT");
  lines.push(`UID:${uid}`);
  lines.push(`DTSTAMP:${now}`);
  lines.push(`DTSTART:${dtStart}`);
  lines.push(`DTEND:${dtEnd}`);
  lines.push(`SUMMARY:${summary}`);
  if (description) lines.push(`DESCRIPTION:${description}`);
  lines.push(`LOCATION:${session.unit ?? "Clínica"}`);
  if (session.clientEmail) lines.push(`ATTENDEE;CN="${session.clientName}";RSVP=FALSE:mailto:${session.clientEmail}`);
  lines.push(`STATUS:${session.status === "completed" ? "COMPLETED" : "CONFIRMED"}`);
  lines.push("END:VEVENT");

  return lines;
}

router.get("/sessions", async (req, res): Promise<void> => {
  const query = ListSessionsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  let sessions = await db.select().from(sessionsTable);

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

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PADCOM Protocolos Injetáveis//BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:PADCOM Agenda",
    "X-WR-TIMEZONE:America/Sao_Paulo",
  ];

  for (const session of results) {
    lines.push(...buildICSEvent(session));
  }

  lines.push("END:VCALENDAR");

  const icsContent = lines.join("\r\n");
  const label = dateFrom && dateTo ? `${dateFrom}_a_${dateTo}` : "agenda";
  const filename = `padcom_${label}.ics`;

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

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PADCOM Protocolos Injetáveis//BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...buildICSEvent(result),
    "END:VCALENDAR",
  ];

  const icsContent = lines.join("\r\n");
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, session.clientId));
  const clientSlug = client?.name?.replace(/\s+/g, "_") ?? "cliente";
  const filename = `padcom_sessao_${id}_${clientSlug}.ics`;

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

  const [session] = await db.insert(sessionsTable).values(parsed.data).returning();
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
