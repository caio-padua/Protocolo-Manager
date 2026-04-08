import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  sessionsTable,
  clientsTable,
  substancesTable,
  substanceApplicationsTable,
  locationsTable,
} from "@workspace/db";
import {
  createCalendarEvent,
  listCalendars,
  type CalendarEventData,
} from "../lib/google-calendar";

const router: IRouter = Router();

function procedureTypeLabel(type: string): string {
  switch (type) {
    case "iv": return "Aplicacao Endovenosa";
    case "im": return "Aplicacao Intramuscular";
    case "implant": return "Implante";
    default: return "Procedimento";
  }
}

function getDurationForProcedureType(type: string): number {
  switch (type) {
    case "iv": return 30;
    case "im": return 15;
    case "implant": return 60;
    default: return 30;
  }
}

async function findLocationByUnit(unitName: string | null): Promise<{ address: string | null; googleCalendarId: string | null }> {
  if (!unitName) return { address: null, googleCalendarId: null };
  const locations = await db.select().from(locationsTable);
  const match = locations.find(l => l.name.toLowerCase().includes(unitName.toLowerCase()) || unitName.toLowerCase().includes(l.name.toLowerCase()));
  return {
    address: match?.address ?? null,
    googleCalendarId: match?.googleCalendarId ?? null,
  };
}

router.get("/google-calendar/status", async (_req, res): Promise<void> => {
  try {
    const calendars = await listCalendars();
    res.json({ connected: true, calendars: calendars.map(c => ({ id: c.id, summary: c.summary })) });
  } catch (err: any) {
    res.json({ connected: false, error: err.message });
  }
});

router.post("/google-calendar/sync-session/:sessionId", async (req, res): Promise<void> => {
  const sessionId = parseInt(req.params.sessionId);
  if (isNaN(sessionId)) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, session.clientId));
  if (!client) {
    res.status(400).json({ error: "Client not found" });
    return;
  }

  const applications = await db.select().from(substanceApplicationsTable)
    .where(eq(substanceApplicationsTable.sessionId, sessionId));
  const dispApps = applications.filter(a => a.availability === "disp");

  const substances: CalendarEventData["substances"] = [];
  let primaryProcType = "iv";

  for (const app of dispApps) {
    const [substance] = await db.select().from(substancesTable).where(eq(substancesTable.id, app.substanceId));
    if (substance) {
      substances.push({
        name: substance.name,
        dose: app.dose,
        sessionNumber: app.sessionNumber,
        totalSessions: app.totalSessions,
      });
      primaryProcType = substance.procedureType ?? "iv";
    }
  }

  const location = await findLocationByUnit(session.unit);

  const isDomiciliar = location.address?.toLowerCase().includes("itinerante") ||
    session.unit?.toLowerCase().includes("domiciliar") ||
    session.unit?.toLowerCase().includes("nurse care");
  const resolvedAddress = isDomiciliar && client.address
    ? client.address
    : location.address ?? undefined;

  const isDoctor = primaryProcType === "implant" || primaryProcType === "consultation";
  let targetCalendarId = location.googleCalendarId ?? undefined;
  if (isDoctor && location.googleCalendarId) {
    const allLocations = await db.select().from(locationsTable);
    const doctorCal = allLocations.find(l => l.googleCalendarId && l.googleCalendarId.includes("MEDICO"));
    if (doctorCal?.googleCalendarId) {
      targetCalendarId = doctorCal.googleCalendarId;
    }
  }

  try {
    const eventId = await createCalendarEvent({
      sessionId: session.id,
      clientName: client.name,
      clientCpf: client.cpf,
      scheduledDate: session.scheduledDate,
      scheduledTime: session.scheduledTime,
      durationMinutes: getDurationForProcedureType(primaryProcType),
      weekNumber: session.weekNumber,
      unit: session.unit ?? "Clinica Padua",
      locationAddress: resolvedAddress,
      calendarId: targetCalendarId,
      procedureType: primaryProcType,
      procedureLabel: procedureTypeLabel(primaryProcType),
      substances,
      clientEmail: client.email || undefined,
    });

    res.json({ success: true, eventId });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/google-calendar/sync-week", async (req, res): Promise<void> => {
  const { dateFrom, dateTo } = req.body as { dateFrom?: string; dateTo?: string };

  if (!dateFrom || !dateTo) {
    res.status(400).json({ error: "dateFrom and dateTo required" });
    return;
  }

  const sessions = await db.select().from(sessionsTable);
  const weekSessions = sessions.filter(
    s => s.scheduledDate >= dateFrom && s.scheduledDate <= dateTo && s.status !== "cancelled"
  );

  const results: Array<{ sessionId: number; clientName: string; success: boolean; eventId?: string; error?: string }> = [];

  for (const session of weekSessions) {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, session.clientId));
    if (!client) continue;

    const applications = await db.select().from(substanceApplicationsTable)
      .where(eq(substanceApplicationsTable.sessionId, session.id));
    const dispApps = applications.filter(a => a.availability === "disp");

    const substances: CalendarEventData["substances"] = [];
    let primaryProcType = "iv";

    for (const app of dispApps) {
      const [substance] = await db.select().from(substancesTable).where(eq(substancesTable.id, app.substanceId));
      if (substance) {
        substances.push({
          name: substance.name,
          dose: app.dose,
          sessionNumber: app.sessionNumber,
          totalSessions: app.totalSessions,
        });
        primaryProcType = substance.procedureType ?? "iv";
      }
    }

    const location = await findLocationByUnit(session.unit);

    const isDomiciliar2 = location.address?.toLowerCase().includes("itinerante") ||
      session.unit?.toLowerCase().includes("domiciliar") ||
      session.unit?.toLowerCase().includes("nurse care");
    const resolvedAddr = isDomiciliar2 && client.address
      ? client.address
      : location.address ?? undefined;

    const isDoctor2 = primaryProcType === "implant" || primaryProcType === "consultation";
    let targetCal = location.googleCalendarId ?? undefined;
    if (isDoctor2 && location.googleCalendarId) {
      const allLocs = await db.select().from(locationsTable);
      const doctorCal = allLocs.find(l => l.googleCalendarId && l.googleCalendarId.includes("MEDICO"));
      if (doctorCal?.googleCalendarId) {
        targetCal = doctorCal.googleCalendarId;
      }
    }

    try {
      const eventId = await createCalendarEvent({
        sessionId: session.id,
        clientName: client.name,
        clientCpf: client.cpf,
        scheduledDate: session.scheduledDate,
        scheduledTime: session.scheduledTime,
        durationMinutes: getDurationForProcedureType(primaryProcType),
        weekNumber: session.weekNumber,
        unit: session.unit ?? "Clinica Padua",
        locationAddress: resolvedAddr,
        calendarId: targetCal,
        procedureType: primaryProcType,
        procedureLabel: procedureTypeLabel(primaryProcType),
        substances,
        clientEmail: client.email || undefined,
      });
      results.push({ sessionId: session.id, clientName: client.name, success: true, eventId: eventId ?? undefined });
    } catch (err: any) {
      results.push({ sessionId: session.id, clientName: client.name, success: false, error: err.message });
    }
  }

  res.json({
    synced: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    details: results,
  });
});

export default router;
