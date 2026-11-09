import { Router, type IRouter } from "express";
import { moduleGuard } from "../middleware/moduleGuard";
import { eq, and, isNull } from "drizzle-orm";
import { resolveEmpresaId } from "../middleware/tenantContext";
import { requireCollaborator } from "./collaborator";
import { bookSession, rescheduleSession } from "../lib/agenda-booking";
import { refreshAfterReschedule, removeSessionEvent } from "../lib/session-google-sync";
import { db, sessionsTable, substanceApplicationsTable, clientsTable, professionalsTable, substancesTable, protocolsTable, locationsTable, locationProfessionalsTable } from "@workspace/db";
import { buildVCalendar, durationFromProcedureTypes, type IcsEventInput } from "../lib/ics";
import { estadoAplicacao } from "../lib/estado-aplicacao-protocolo";
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
      displayState: estadoAplicacao(app),
      appliedAt: app.appliedAt ?? null,
      confirmedBy: app.confirmedBy ?? null,
      confirmedAt: app.confirmedAt ?? null,
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

  // Consultas do prontuário por cliente/protocolo preservam o histórico clínico.
  // A visão geral da agenda não inclui compromissos retirados.
  if (!query.data.clientId && !query.data.protocolId) sessions = sessions.filter(s => !s.agendaArchived);
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

  const empresaId = resolveEmpresaId(req);
  let sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.empresaId, empresaId));
  sessions = sessions.filter(s => !s.agendaArchived);

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
  if (!session || session.agendaArchived || session.empresaId !== resolveEmpresaId(req)) {
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

router.post("/sessions", requireCollaborator, async (req, res): Promise<void> => {
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const empresaId = resolveEmpresaId(req);
  if (!parsed.data.resourceId || parsed.data.status !== "scheduled") {
    res.status(422).json({error:"Uma nova marcação exige agenda e status agendado; utilize o Motor de Agenda."}); return;
  }
  const booked = await bookSession({
    resourceId: parsed.data.resourceId, clientId: parsed.data.clientId,
    protocolId: parsed.data.protocolId, date: parsed.data.scheduledDate,
    time: parsed.data.scheduledTime, empresaId, syncGoogle: false,
  });
  if (!booked.ok || !booked.session) {res.status(booked.status).json({error:booked.error});return;}
  const result = await buildSessionResponse(booked.session);
  res.status(201).json(result);
});

router.get("/sessions/:id", async (req, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Mesma regra da lista e do .ics: sessão de outra clínica é "não encontrada" (nunca expõe cliente nem aplicações).
  const [session] = await db.select().from(sessionsTable)
    .where(and(eq(sessionsTable.id, params.data.id), eq(sessionsTable.empresaId, resolveEmpresaId(req))));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const result = await buildSessionResponse(session);
  res.json(result);
});

router.put("/sessions/:id", requireCollaborator, async (req, res): Promise<void> => {
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

  const [existing] = await db.select().from(sessionsTable).where(and(eq(sessionsTable.id,params.data.id),eq(sessionsTable.empresaId,resolveEmpresaId(req))));
  if (!existing || existing.agendaArchived) {res.status(404).json({error:"Sessão não encontrada."});return;}
  if (existing.googleSyncPendingOperation) {res.status(409).json({error:"A sincronização Google precisa ser concluída ou conferida antes de alterar a sessão."});return;}
  if (parsed.data.professionalId !== undefined && parsed.data.professionalId !== existing.professionalId) {
    res.status(422).json({error:"Troca de profissional exige selecionar uma agenda na remarcação."});return;
  }
  if (["scheduled","confirmed"].includes(parsed.data.status ?? "") && !["scheduled","confirmed"].includes(existing.status)) {
    res.status(409).json({error:"Reativação exige nova marcação em uma vaga liberada."});return;
  }
  const changingSchedule = (parsed.data.scheduledDate && parsed.data.scheduledDate!==existing.scheduledDate)
    || (parsed.data.scheduledTime && parsed.data.scheduledTime!==existing.scheduledTime);
  if (changingSchedule) {
    const otherChanges = Object.entries(parsed.data).some(([key, value]) =>
      key !== "scheduledDate" && key !== "scheduledTime" && value !== undefined &&
      value !== existing[key as keyof typeof existing],
    );
    if (otherChanges) {
      res.status(422).json({error:"Remarque o horário separadamente das demais alterações; nenhuma mudança foi salva."});
      return;
    }
    if (!existing.resourceId) {res.status(422).json({error:"Defina uma agenda antes de remarcar."});return;}
    const moved = await rescheduleSession({sessionId:existing.id,clientId:existing.clientId,
      resourceId:existing.resourceId,date:parsed.data.scheduledDate??existing.scheduledDate,
      time:parsed.data.scheduledTime??existing.scheduledTime,syncGoogle:false});
    if (!moved.ok) {res.status(moved.status).json({error:moved.error});return;}
    if (!moved.session) {res.status(500).json({error:"Não foi possível confirmar a remarcação; confira a agenda antes de repetir."});return;}
    // Visita de protocolo que ja esta no Google: o MESMO evento acompanha o novo dia/horario (aviso, nunca bloqueio).
    const googleSyncWarning = moved.googleRefreshNeeded
      ? await refreshAfterReschedule(moved.session.id, resolveEmpresaId(req)) : moved.googleSyncWarning;
    res.json({ ...(await buildSessionResponse(moved.session)), ...(googleSyncWarning ? { googleSyncWarning } : {}) });
    return;
  }
  const {scheduledDate:_date,scheduledTime:_time,...updates} = parsed.data;
  const whereSession = and(eq(sessionsTable.id, params.data.id),eq(sessionsTable.empresaId,resolveEmpresaId(req)),
    isNull(sessionsTable.googleSyncPendingOperation));
  const [session] = Object.keys(updates).length
    ? await db.update(sessionsTable).set(updates).where(whereSession).returning()
    : await db.select().from(sessionsTable).where(whereSession);
  if (!session) {
    res.status(409).json({ error: "A sessão mudou ou está em sincronização. Confira a situação antes de continuar." });
    return;
  }

  // Cancelada pelo sistema: o evento sai do Google. Falha do Google mantem o rastro e vira aviso; o cancelamento vale.
  let googleSyncWarning: string | undefined;
  // Repetir o cancelamento de visita cancelada que ainda guarda o ponteiro do evento tenta remover o evento de novo.
  if (parsed.data.status === "cancelled" && existing.googleEventId) {
    googleSyncWarning = (await removeSessionEvent(session.id, resolveEmpresaId(req))).warning;
  }
  const result = await buildSessionResponse(session);
  res.json(googleSyncWarning ? { ...result, googleSyncWarning } : result);
});

class ApplicationConfirmationError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}

router.post("/sessions/:id/confirm-substance", requireCollaborator, async (req, res): Promise<void> => {
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

  try {
    const session = await db.transaction(async tx => {
      const [current] = await tx.select().from(sessionsTable)
        .where(eq(sessionsTable.id, params.data.id)).for("update");
      const notFound = () => new ApplicationConfirmationError(404, "Registro não encontrado neste acesso.");
      if (!current || current.agendaArchived) throw notFound();
      if (current.googleSyncPendingOperation) {
        throw new ApplicationConfirmationError(409, "A sincronização Google precisa ser concluída ou conferida antes de registrar a aplicação.");
      }
      const companyId = resolveEmpresaId(req);
      if (current.empresaId !== null && current.empresaId !== companyId) throw notFound();
      const [client] = await tx.select().from(clientsTable).where(eq(clientsTable.id, current.clientId)).for("update");
      const [protocol] = await tx.select().from(protocolsTable).where(eq(protocolsTable.id, current.protocolId)).for("update");
      const [professional] = await tx.select().from(professionalsTable)
        .where(eq(professionalsTable.id, req.collaborator!.professionalId)).for("update");
      if (!client || client.empresaId !== companyId || client.status !== "active" || !client.locationId ||
          !protocol || protocol.empresaId !== companyId || protocol.clientId !== client.id ||
          !professional?.active || (professional.credentialVersion ?? 0) !== (req.collaborator!.credentialVersion ?? 0)) {
        throw notFound();
      }
      const [location] = await tx.select().from(locationsTable).where(eq(locationsTable.id, client.locationId)).for("update");
      const [membership] = await tx.select().from(locationProfessionalsTable).where(and(
        eq(locationProfessionalsTable.locationId, client.locationId),
        eq(locationProfessionalsTable.professionalId, professional.id),
      )).for("update");
      if (!location || location.active !== "true" || location.empresaId !== companyId || !membership) throw notFound();

      const applications = await tx.select().from(substanceApplicationsTable)
        .where(eq(substanceApplicationsTable.sessionId, current.id));
      const candidates = applications.filter(a => a.substanceId === body.data.substanceId && a.availability === "disp");
      const matches = body.data.applicationId === undefined
        ? candidates : candidates.filter(a => a.id === body.data.applicationId);
      if (matches.length === 0) throw notFound();
      if (matches.length > 1) throw new ApplicationConfirmationError(409, "Selecione a ocorrência específica da aplicação.");
      const target = matches[0];
      const desiredStatus = body.data.confirmed ? "applied" : "missed";
      if (target.status !== "pending" || target.appliedAt) {
        const sameResult = target.status === desiredStatus &&
          (desiredStatus === "applied" ? !!target.appliedAt : !target.appliedAt) &&
          (body.data.notes === undefined || body.data.notes === target.notes);
        if (sameResult) return current;
        throw new ApplicationConfirmationError(409, "Esta aplicação já possui um registro. A correção exige retificação rastreável.");
      }
      if (["completed", "cancelled", "missed"].includes(current.status)) {
        throw new ApplicationConfirmationError(409, "A sessão está encerrada ou cancelada; confira antes de alterar.");
      }
      await tx.update(substanceApplicationsTable).set({
        status: desiredStatus,
        appliedAt: body.data.confirmed ? new Date().toISOString() : null,
        confirmedBy: professional.id,
        confirmedAt: new Date().toISOString(),
        notes: body.data.notes ?? null,
      }).where(eq(substanceApplicationsTable.id, target.id));
      const updated = applications.map(a => a.id === target.id ? { ...a, status: desiredStatus } : a);
      const due = updated.filter(a => a.availability === "disp");
      if (due.length > 0 && due.every(a => a.status === "applied" || a.status === "missed")) {
        const [closed] = await tx.update(sessionsTable).set({ status: "completed" })
          .where(eq(sessionsTable.id, current.id)).returning();
        return closed;
      }
      return current;
    });
    res.json(await buildSessionResponse(session));
  } catch (error) {
    if (error instanceof ApplicationConfirmationError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    throw error;
  }
});

export default router;
