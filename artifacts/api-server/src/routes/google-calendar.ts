import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  sessionsTable,
  clientsTable,
  substancesTable,
  substanceApplicationsTable,
  locationsTable,
  professionalsTable,
  agendaResourcesTable,
} from "@workspace/db";
import {
  createCalendarEvent,
  updateCalendarEvent,
  updateCalendarEventDescription,
  deleteCalendarEvent,
  listCalendars,
  type CalendarEventData,
  type CalendarSubstance,
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
    case "consultation": return 60;
    default: return 30;
  }
}

function calculateTotalDuration(dispProcedureTypes: Set<string>): number {
  if (dispProcedureTypes.size === 0) return 60;
  let total = 0;
  for (const t of dispProcedureTypes) {
    total += getDurationForProcedureType(t);
  }
  return total;
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

  const substances: CalendarSubstance[] = [];
  let primaryProcType = "iv";
  const activeProcTypes = new Set<string>();
  const dispProcTypes = new Set<string>();
  let hasDisp = false;

  for (const app of applications) {
    const [substance] = await db.select().from(substancesTable).where(eq(substancesTable.id, app.substanceId));
    if (substance) {
      const status = app.appliedAt ? "applied" : (app.availability as "disp" | "prox" | "missed") || "prox";
      substances.push({
        name: substance.name,
        dose: app.dose,
        sessionNumber: app.sessionNumber,
        totalSessions: app.totalSessions,
        status,
      });
      if (substance.procedureType) {
        activeProcTypes.add(substance.procedureType);
      }
      if (app.availability === "disp") {
        hasDisp = true;
        primaryProcType = substance.procedureType ?? "iv";
        dispProcTypes.add(substance.procedureType ?? "iv");
      }
    }
  }

  if (!hasDisp) {
    if (session.professionalId) {
      const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, session.professionalId));
      if (prof?.specialty?.toLowerCase().includes("médic") || prof?.specialty?.toLowerCase().includes("medic")) {
        primaryProcType = "consultation";
        dispProcTypes.add("consultation");
      }
    }
    if (substances.length === 0) {
      primaryProcType = "consultation";
      dispProcTypes.add("consultation");
    }
  }
  activeProcTypes.add(primaryProcType);

  const totalDuration = calculateTotalDuration(dispProcTypes);

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
  // Preferencia: calendario do recurso da agenda (Enf. Local, Medico Local, etc.).
  if (session.resourceId) {
    const [resource] = await db.select().from(agendaResourcesTable).where(eq(agendaResourcesTable.id, session.resourceId));
    if (resource?.googleCalendarId) {
      targetCalendarId = resource.googleCalendarId;
    }
  }

  try {
    const protocolSessions = await db.select({ id: sessionsTable.id }).from(sessionsTable)
      .where(eq(sessionsTable.protocolId, session.protocolId));

    const eventData: CalendarEventData = {
      sessionId: session.id,
      clientName: client.name,
      clientCpf: client.cpf,
      scheduledDate: session.scheduledDate,
      scheduledTime: session.scheduledTime,
      durationMinutes: totalDuration,
      weekNumber: session.weekNumber,
      totalAppointments: protocolSessions.length,
      unit: session.unit ?? "Clinica Padua",
      locationAddress: resolvedAddress,
      calendarId: targetCalendarId,
      procedureType: primaryProcType,
      procedureLabel: procedureTypeLabel(primaryProcType),
      // Só os procedimentos EXECUTAVEIS nesta ida (DISP/aplicados): evita ✅ e
      // Duração Total inflados por substancia PROX de outro tipo.
      activeProcedureTypes: Array.from(dispProcTypes),
      substances,
      clientEmail: client.email || undefined,
      sessionStatus: session.status,
    };

    // Convite B: se ja existe evento NO MESMO calendario, ATUALIZA no lugar (nao apaga+recria,
    // nao dispara "Evento cancelado"). Só quando o calendario MUDA (ou legado sem calendarId)
    // apagamos (sem notificar) e recriamos no calendario novo.
    let eventId: string | null = session.googleEventId;
    // Normaliza null/undefined -> "primary" para nao cair em apagar+recriar quando ambos sao o primario.
    const oldCal = session.googleCalendarId || "primary";
    const newCal = targetCalendarId || "primary";
    const sameCalendar = !!session.googleEventId && oldCal === newCal;

    if (sameCalendar && session.googleEventId) {
      await updateCalendarEvent(session.googleEventId, oldCal, eventData);
    } else {
      if (session.googleEventId) {
        try {
          await deleteCalendarEvent(session.googleEventId, oldCal);
        } catch (delErr: any) {
          console.warn("Could not delete old calendar event:", delErr.message);
        }
      }
      eventId = await createCalendarEvent(eventData);
    }

    if (eventId) {
      await db.update(sessionsTable).set({
        googleEventId: eventId,
        googleCalendarId: targetCalendarId || null,
      }).where(eq(sessionsTable.id, session.id));
    }

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

    const substances: CalendarSubstance[] = [];
    let primaryProcType = "iv";
    const activeProcTypes2 = new Set<string>();
    const dispProcTypes2 = new Set<string>();
    let hasDisp2 = false;

    for (const app of applications) {
      const [substance] = await db.select().from(substancesTable).where(eq(substancesTable.id, app.substanceId));
      if (substance) {
        const status = app.appliedAt ? "applied" : (app.availability as "disp" | "prox" | "missed") || "prox";
        substances.push({
          name: substance.name,
          dose: app.dose,
          sessionNumber: app.sessionNumber,
          totalSessions: app.totalSessions,
          status,
        });
        if (substance.procedureType) {
          activeProcTypes2.add(substance.procedureType);
        }
        if (app.availability === "disp") {
          hasDisp2 = true;
          primaryProcType = substance.procedureType ?? "iv";
          dispProcTypes2.add(substance.procedureType ?? "iv");
        }
      }
    }

    if (!hasDisp2) {
      if (session.professionalId) {
        const [prof] = await db.select().from(professionalsTable).where(eq(professionalsTable.id, session.professionalId));
        if (prof?.specialty?.toLowerCase().includes("médic") || prof?.specialty?.toLowerCase().includes("medic")) {
          primaryProcType = "consultation";
          dispProcTypes2.add("consultation");
        }
      }
      if (substances.length === 0) {
        primaryProcType = "consultation";
        dispProcTypes2.add("consultation");
      }
    }
    activeProcTypes2.add(primaryProcType);

    const totalDuration2 = calculateTotalDuration(dispProcTypes2);

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
    // Preferencia: calendario do recurso da agenda (Enf. Local, Medico Local, etc.).
    if (session.resourceId) {
      const [resource] = await db.select().from(agendaResourcesTable).where(eq(agendaResourcesTable.id, session.resourceId));
      if (resource?.googleCalendarId) {
        targetCal = resource.googleCalendarId;
      }
    }

    try {
      const protocolSessions2 = await db.select({ id: sessionsTable.id }).from(sessionsTable)
        .where(eq(sessionsTable.protocolId, session.protocolId));

      const eventData2: CalendarEventData = {
        sessionId: session.id,
        clientName: client.name,
        clientCpf: client.cpf,
        scheduledDate: session.scheduledDate,
        scheduledTime: session.scheduledTime,
        durationMinutes: totalDuration2,
        weekNumber: session.weekNumber,
        totalAppointments: protocolSessions2.length,
        unit: session.unit ?? "Clinica Padua",
        locationAddress: resolvedAddr,
        calendarId: targetCal,
        procedureType: primaryProcType,
        procedureLabel: procedureTypeLabel(primaryProcType),
        activeProcedureTypes: Array.from(dispProcTypes2),
        substances,
        clientEmail: client.email || undefined,
        sessionStatus: session.status,
      };

      // Convite B: mesmo calendario -> atualiza no lugar; calendario novo -> apaga (sem notificar) e recria.
      let eventId: string | null = session.googleEventId;
      // Normaliza null/undefined -> "primary" para nao cair em apagar+recriar quando ambos sao o primario.
      const oldCal2 = session.googleCalendarId || "primary";
      const newCal2 = targetCal || "primary";
      const sameCal = !!session.googleEventId && oldCal2 === newCal2;

      if (sameCal && session.googleEventId) {
        await updateCalendarEvent(session.googleEventId, oldCal2, eventData2);
      } else {
        if (session.googleEventId) {
          try {
            await deleteCalendarEvent(session.googleEventId, oldCal2);
          } catch (_delErr: any) {}
        }
        eventId = await createCalendarEvent(eventData2);
      }

      if (eventId) {
        await db.update(sessionsTable).set({
          googleEventId: eventId,
          googleCalendarId: targetCal || null,
        }).where(eq(sessionsTable.id, session.id));
      }

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
