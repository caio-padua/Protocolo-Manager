import { textoExternoDaAgenda } from "../lib/agenda-endereco-externo.js";
import { Router, type IRouter, type Request } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  sessionsTable,
  clientsTable,
  substancesTable,
  substanceApplicationsTable,
  locationsTable,
  professionalsTable,
  agendaResourcesTable,
  protocolsTable,
  locationProfessionalsTable,
} from "@workspace/db";
import {
  listCalendars,
  verifyClinicAccount,
  type CalendarEventData,
  type CalendarSubstance,
} from "../lib/google-calendar";
import { estadoAplicacao } from "../lib/estado-aplicacao-protocolo";
import { GoogleConflito } from "../lib/google-conflito";
import { CalendarSyncUncertain, montarConstantesDoEvento, procedureTypeLabel, syncReservedEvent } from "../lib/session-google-sync";
import { carregarItensDoProtocolo } from "../lib/substancias-constantes";
import { requireCollaborator } from "./collaborator";
import { ClinicalIdentityError, resolveClinicalMember } from "../lib/clinical-emitter";
import { resolveEmpresaId } from "../middleware/tenantContext";

const router: IRouter = Router();

async function authorizeSession(req: Request, session: typeof sessionsTable.$inferSelect) {
  const empresaId = resolveEmpresaId(req);
  if (session.agendaArchived || (session.empresaId !== null && session.empresaId !== empresaId)) return null;
  // Envio manual por sessão é do fluxo de protocolo; consulta avulsa (sem protocolo) vai ao Google pela marcação.
  if (session.protocolId == null) return null;
  const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, session.protocolId));
  if (!protocol || protocol.empresaId !== empresaId || protocol.clientId !== session.clientId) return null;
  try {
    const member = await resolveClinicalMember(req, session.clientId);
    if (member.clinic.empresaId !== empresaId) return null;
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, session.clientId));
    return client ? { client, clinicId: member.clinic.id } : null;
  } catch (error) {
    if (error instanceof ClinicalIdentityError) return null;
    throw error;
  }
}

async function explicitDestination(req: Request, session: typeof sessionsTable.$inferSelect) {
  if (!session.resourceId) return null;
  const [resource] = await db.select().from(agendaResourcesTable).where(eq(agendaResourcesTable.id, session.resourceId));
  if (!resource?.active || !resource.locationId || !resource.googleCalendarId) return null;
  const [location] = await db.select().from(locationsTable).where(eq(locationsTable.id, resource.locationId));
  if (!location || location.active !== "true" || location.empresaId !== resolveEmpresaId(req)) return null;
  const [membership] = await db.select().from(locationProfessionalsTable).where(and(
    eq(locationProfessionalsTable.locationId, location.id),
    eq(locationProfessionalsTable.professionalId, req.collaborator!.professionalId),
  ));
  if (!membership) return null;
  return { resource, location, calendarId: resource.googleCalendarId, externalAddress: textoExternoDaAgenda(resource) };
}

router.get("/google-calendar/status", requireCollaborator, async (_req, res): Promise<void> => {
  try {
    const calendars = await listCalendars();
    res.json({ connected: true, calendars: calendars.map(c => ({ id: c.id, summary: c.summary })) });
  } catch (err: any) {
    res.json({ connected: false, error: err.message });
  }
});

router.post("/google-calendar/sync-session/:sessionId", requireCollaborator, async (req, res): Promise<void> => {
  const sessionId = Number(req.params.sessionId);
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const authorization = await authorizeSession(req, session);
  if (!authorization) {
    res.status(404).json({ error: "Sessão não encontrada neste acesso." });
    return;
  }
  const { client } = authorization;
  if (session.protocolId == null) { res.status(404).json({ error: "Sessão não encontrada neste acesso." }); return; }
  const destination = await explicitDestination(req, session);
  if (!destination || !session.durationMinutes || session.durationMinutes <= 0) {
    res.status(409).json({ error: "Defina a agenda de atendimento, a agenda Google e a duração da sessão antes de sincronizar." });
    return;
  }
  if (session.googleEventId && session.googleCalendarId !== destination.calendarId) {
    res.status(409).json({ error: "A sessão pertence a outra agenda Google; a transferência exige conferência e não foi realizada." });
    return;
  }
  if (!(await verifyClinicAccount()).ok) {
    res.status(503).json({ error: "Não foi possível confirmar a conta Google autorizada." });
    return;
  }

  const applications = await db.select().from(substanceApplicationsTable)
    .where(eq(substanceApplicationsTable.sessionId, sessionId));

  const substances: CalendarSubstance[] = [];
  let primaryProcType = "";
  const activeProcTypes = new Set<string>();
  const dispProcTypes = new Set<string>();
  let hasDisp = false;

  for (const app of applications) {
    const [substance] = await db.select().from(substancesTable).where(eq(substancesTable.id, app.substanceId));
    if (!substance || (app.availability === "disp" && !substance.procedureType)) {
      res.status(409).json({ error: "Substância ou via não identificada; nenhum evento foi alterado." });
      return;
    }
    if (substance) {
      const status = estadoAplicacao(app);
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
        primaryProcType = substance.procedureType!;
        dispProcTypes.add(substance.procedureType!);
      }
    }
  }

  if (!hasDisp) {
    if (applications.length === 0 && destination.resource.kind === "medico") {
      primaryProcType = "consultation";
      dispProcTypes.add("consultation");
    }
  }
  if (!primaryProcType) {
    res.status(409).json({ error: "Procedimento do dia não identificado; nenhum evento foi alterado." });
    return;
  }
  activeProcTypes.add(primaryProcType);

  const totalDuration = session.durationMinutes;

  const location = destination.location;

  const isDomiciliar = location.address?.toLowerCase().includes("itinerante") ||
    session.unit?.toLowerCase().includes("domiciliar") ||
    session.unit?.toLowerCase().includes("nurse care");
  const resolvedAddress = destination.externalAddress
    ?? (isDomiciliar && client.address ? client.address : location.address ?? undefined);

  const targetCalendarId = destination.calendarId;

  try {
    const protocolSessions = await db.select({ id: sessionsTable.id }).from(sessionsTable)
      .where(eq(sessionsTable.protocolId, session.protocolId));

    const eventData: CalendarEventData = {
      sessionId: session.id,
      clientName: client.name,
      clientCpf: client.cpf ?? undefined,
      scheduledDate: session.scheduledDate,
      scheduledTime: session.scheduledTime,
      durationMinutes: totalDuration,
      weekNumber: session.weekNumber,
      totalAppointments: protocolSessions.length,
      unit: session.unit ?? destination.location.name,
      locationAddress: resolvedAddress,
      locationPhone: location.phone ?? undefined,
      calendarId: targetCalendarId,
      procedureType: primaryProcType,
      procedureLabel: procedureTypeLabel(primaryProcType),
      // Só os procedimentos EXECUTAVEIS nesta ida (DISP/aplicados): evita ✅ e
      // Duração Total inflados por substancia PROX de outro tipo.
      activeProcedureTypes: Array.from(dispProcTypes),
      substances,
      clientEmail: client.email || undefined,
      sessionStatus: session.status,
      rescheduleCount: session.rescheduleCount,
    };

    // K7: o evento enviado por aqui também lista todo o protocolo (mesma função do envio por protocolo).
    const protocolItems = await carregarItensDoProtocolo(session.protocolId, session.empresaId);
    const extra = await montarConstantesDoEvento(applications, protocolItems);
    eventData.substances.push(...extra.constants);
    Object.assign(eventData, extra.counts);

    const eventId = await syncReservedEvent(session, eventData, applications, { expectedProtocolItems: protocolItems });

    res.json({ success: true, eventId });
  } catch (err: any) {
    if (err instanceof CalendarSyncUncertain || err instanceof GoogleConflito) {
      res.status(409).json({ success: false, ...(err instanceof GoogleConflito ? { code: err.code } : {}), error: err.message });
      return;
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/google-calendar/sync-week", requireCollaborator, async (req, res): Promise<void> => {
  const { dateFrom, dateTo } = req.body as { dateFrom?: string; dateTo?: string };

  if (!dateFrom || !dateTo) {
    res.status(400).json({ error: "dateFrom and dateTo required" });
    return;
  }
  const parseDay = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date.getTime() : NaN;
  };
  const from = parseDay(dateFrom);
  const to = parseDay(dateTo);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 6 * 86_400_000) {
    res.status(400).json({ error: "Selecione um período válido de até sete dias." });
    return;
  }

  const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.empresaId, resolveEmpresaId(req)));
  const weekSessions = sessions.filter(
    s => !s.agendaArchived && s.scheduledDate >= dateFrom && s.scheduledDate <= dateTo && s.status !== "cancelled"
  );

  const results: Array<{ sessionId: number; clientName: string; success: boolean; eventId?: string; error?: string }> = [];

  for (const session of weekSessions) {
    const authorization = await authorizeSession(req, session);
    if (!authorization || session.protocolId == null) continue;
    const { client } = authorization;
    const destination = await explicitDestination(req, session);
    if (!destination || !session.durationMinutes || session.durationMinutes <= 0 ||
        (session.googleEventId && session.googleCalendarId !== destination.calendarId)) {
      results.push({ sessionId: session.id, clientName: client.name, success: false,
        error: "Agenda de atendimento, agenda Google ou duração exigem conferência; nenhum evento foi alterado." });
      continue;
    }
    if (!(await verifyClinicAccount()).ok) {
      results.push({ sessionId: session.id, clientName: client.name, success: false,
        error: "Não foi possível confirmar a conta Google autorizada." });
      continue;
    }

    const applications = await db.select().from(substanceApplicationsTable)
      .where(eq(substanceApplicationsTable.sessionId, session.id));

    const substances: CalendarSubstance[] = [];
    let primaryProcType = "";
    const activeProcTypes2 = new Set<string>();
    const dispProcTypes2 = new Set<string>();
    let hasDisp2 = false;
    let unresolvedSubstance = false;

    for (const app of applications) {
      const [substance] = await db.select().from(substancesTable).where(eq(substancesTable.id, app.substanceId));
      if (!substance || (app.availability === "disp" && !substance.procedureType)) {
        unresolvedSubstance = true;
        break;
      }
      if (substance) {
        const status = estadoAplicacao(app);
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
          primaryProcType = substance.procedureType!;
          dispProcTypes2.add(substance.procedureType!);
        }
      }
    }
    if (unresolvedSubstance) {
      results.push({ sessionId: session.id, clientName: client.name, success: false,
        error: "Substância ou via não identificada; nenhum evento foi alterado." });
      continue;
    }

    if (!hasDisp2) {
      if (applications.length === 0 && destination.resource.kind === "medico") {
        primaryProcType = "consultation";
        dispProcTypes2.add("consultation");
      }
    }
    if (!primaryProcType) {
      results.push({ sessionId: session.id, clientName: client.name, success: false,
        error: "Substância, via ou procedimento não identificado; nenhum evento foi alterado." });
      continue;
    }
    activeProcTypes2.add(primaryProcType);

    const totalDuration2 = session.durationMinutes;

    const location = destination.location;

    const isDomiciliar2 = location.address?.toLowerCase().includes("itinerante") ||
      session.unit?.toLowerCase().includes("domiciliar") ||
      session.unit?.toLowerCase().includes("nurse care");
    const resolvedAddr = destination.externalAddress
      ?? (isDomiciliar2 && client.address ? client.address : location.address ?? undefined);

    const targetCal = destination.calendarId;

    try {
      const protocolSessions2 = await db.select({ id: sessionsTable.id }).from(sessionsTable)
        .where(eq(sessionsTable.protocolId, session.protocolId));

      const eventData2: CalendarEventData = {
        sessionId: session.id,
        clientName: client.name,
        clientCpf: client.cpf ?? undefined,
        scheduledDate: session.scheduledDate,
        scheduledTime: session.scheduledTime,
        durationMinutes: totalDuration2,
        weekNumber: session.weekNumber,
        totalAppointments: protocolSessions2.length,
        unit: session.unit ?? destination.location.name,
        locationAddress: resolvedAddr,
        locationPhone: location.phone ?? undefined,
        calendarId: targetCal,
        procedureType: primaryProcType,
        procedureLabel: procedureTypeLabel(primaryProcType),
        activeProcedureTypes: Array.from(dispProcTypes2),
        substances,
        clientEmail: client.email || undefined,
        sessionStatus: session.status,
        rescheduleCount: session.rescheduleCount,
      };

      // K7: idem (mesma função do envio por protocolo).
      const protocolItems2 = await carregarItensDoProtocolo(session.protocolId, session.empresaId);
      const extra2 = await montarConstantesDoEvento(applications, protocolItems2);
      eventData2.substances.push(...extra2.constants);
      Object.assign(eventData2, extra2.counts);

      const eventId = await syncReservedEvent(session, eventData2, applications, { expectedProtocolItems: protocolItems2 });

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
