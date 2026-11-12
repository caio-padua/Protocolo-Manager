import { and, eq, or, isNull, inArray, sql } from "drizzle-orm";
import {
  db,
  sessionsTable,
  agendaResourcesTable,
  agendaWindowsTable,
  agendaExceptionsTable,
  agendaSettingsTable,
  clientsTable,
  type Session,
  protocolsTable,
  substanceApplicationsTable,
} from "@workspace/db";
import { loadAgendaOccupancy, type AgendaExecutor } from "./agenda-occupancy";
import { windowOccursOnDate } from "./agenda-window-recurrence";
import { computeAgendaSlots, type EngineResult } from "./agenda-motor.js";
import { deleteCalendarEvent, verifyClinicAccount } from "./google-calendar.js";
import { SIM_TAG, syncBookedSession } from "./session-google-sync";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const validDate = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const value = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(value.getTime()) && value.toISOString().slice(0,10) === date;
};
const blockReason = (reason: string | null) => ({
  antecedencia:"dentro da antecedência mínima", compromisso:"compromisso existente sobreposto",
  integracao:"aguardando atualização segura da agenda Google",
}[reason ?? ""] ?? "ainda não liberado (cadeia)");
export { SIM_TAG };

async function getSettings(db: AgendaExecutor) {
  const [row] = await db.select().from(agendaSettingsTable).orderBy(agendaSettingsTable.id).limit(1);
  if (row) return row;
  const [created] = await db.insert(agendaSettingsTable).values({}).returning();
  return created;
}

/**
 * Calcula os slots de um recurso numa data, usando a ocupacao REAL (sessoes marcadas)
 * a menos que um override seja fornecido (Prova Viva). Fonte unica de verdade do motor.
 */
export async function computeResourceSlots(
  resourceId: number,
  date: string,
  occupiedOverride?: Set<string> | null,
  executor: AgendaExecutor = db,
  ignoreSessionId?: number,
  /** `semAntecedencia`: só o encaixe presencial no término da consulta (Pit Stop) dispensa a antecedência mínima. */
  opts: { semAntecedencia?: boolean } = {},
): Promise<{ resource: typeof agendaResourcesTable.$inferSelect; result: EngineResult } | null> {
  if (!validDate(date)) return null;
  const db = executor;
  const [resource] = await db.select().from(agendaResourcesTable).where(eq(agendaResourcesTable.id, resourceId));
  if (!resource || !resource.active) return null;

  const settings = await getSettings(db);
  const occupancy = await loadAgendaOccupancy(resource, date, db, ignoreSessionId);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();

  const windows = await db
    .select()
    .from(agendaWindowsTable)
    .where(and(eq(agendaWindowsTable.resourceId, resourceId), eq(agendaWindowsTable.weekday, weekday),
      eq(agendaWindowsTable.active, true)));

  const exceptions = await db
    .select()
    .from(agendaExceptionsTable)
    .where(
      and(
        eq(agendaExceptionsTable.date, date),
        or(isNull(agendaExceptionsTable.resourceId), eq(agendaExceptionsTable.resourceId, resourceId)),
      ),
    );

  let occupiedTimes: Set<string>;
  if (occupiedOverride) {
    occupiedTimes = occupiedOverride;
  } else {
    const booked = await db
      .select({ time: sessionsTable.scheduledTime })
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.resourceId, resourceId),
          eq(sessionsTable.scheduledDate, date),
          inArray(sessionsTable.status, ["scheduled", "confirmed", "completed"]),
          eq(sessionsTable.agendaArchived, false),
          ...(ignoreSessionId ? [sql`${sessionsTable.id}<>${ignoreSessionId}`] : []),
        ),
      );
    occupiedTimes = new Set<string>(booked.map((b) => String(b.time).slice(0, 5)).filter((t) => HHMM.test(t)));
  }

  const result = computeAgendaSlots({
    windows: windows.filter(w => windowOccursOnDate(w, date))
      .map((w) => ({ startTime: w.startTime, endTime: w.endTime })),
    slotMinutes: resource.slotMinutes,
    settings: {
      blockMinutes: settings.blockMinutes,
      triggerPercent: settings.triggerPercent,
      minLeadHours: opts.semAntecedencia ? 0 : settings.minLeadHours,
    },
    occupiedTimes,
    now: new Date(),
    date,
    isException: exceptions.length > 0,
    blockedRanges: occupancy.blockedRanges,
    occupiedRanges: occupiedOverride ? [] : occupancy.occupiedRanges,
  });
  if (!occupancy.fresh) {
    result.reason = "sincronizacao-pendente";
    for (const slot of result.slots) if (slot.state !== "ocupado") {
      slot.state = "bloqueado";
      slot.reason = "integracao";
    }
  }

  return { resource, result };
}

export interface BookResult {
  ok: boolean;
  status: number;
  error?: string;
  session?: Session;
  googleEventId?: string | null;
  // Preenchido quando a marcacao foi criada no sistema mas a sincronizacao Google
  // foi pulada (conta conectada nao e a da clinica) ou falhou. Nao quebra a marcacao.
  googleSyncWarning?: string;
  // Remarcacao de visita de protocolo que JA esta no Google: o evento nao foi mexido aqui (isto roda dentro de
  // uma transacao); quem chamou deve atualizar o MESMO evento depois, com refreshAfterReschedule.
  googleRefreshNeeded?: boolean;
  /** Uso interno: evento antigo a remover e novo a criar depois da transação de remarcação. */
  googleMove?: { oldEventId: string | null; oldCalendarId: string | null };
}

export interface BookParams {
  resourceId: number;
  clientId: number;
  protocolId: number;
  date: string;
  time: string;
  serviceType?: string;
  unit?: string;
  syncGoogle?: boolean;
  simulate?: boolean;
  empresaId?: number;
}

export async function lockAgendaResource(executor: AgendaExecutor, resourceId: number) {
  const result = await executor.execute(sql`SELECT COALESCE(r.empresa_id,l.empresa_id) AS empresa_id FROM agenda_resources r
    LEFT JOIN locations l ON l.id=r.location_id
    WHERE r.id=${resourceId} AND r.active AND (r.location_id IS NULL OR l.active='true')`);
  const empresaId = Number(result.rows[0]?.empresa_id);
  if (!empresaId) return null;
  await executor.execute(sql`SELECT pg_advisory_xact_lock(19872026,${empresaId})`);
  return empresaId;
}

/**
 * Marca uma sessao num slot. Valida pelo motor que o horario esta ABERTO (reconsulta
 * a ocupacao real para evitar corrida). Opcionalmente sincroniza com o Google Calendar.
 */
const RESERVABLE_KINDS = new Set(["medico", "enfermagem"]);

export async function bookSession(params: BookParams): Promise<BookResult> {
  if (!validDate(params.date)) return {ok:false,status:400,error:"Data inválida"};
  return db.transaction(async (tx) => {
    const empresaId = await lockAgendaResource(tx, params.resourceId);
    if (!empresaId || (params.empresaId && params.empresaId !== empresaId)) return {ok:false,status:404,error:"Agenda não encontrada"};
    return bookSessionLocked({...params, empresaId}, tx);
  }).then(async (r) => {
    // O Google só é chamado DEPOIS de a marcação estar gravada (fora da transação), com o mesmo evento completo do
    // protocolo: procedimentos, substâncias, status, legenda e endereço da forma da agenda.
    if (!r.ok || !r.session || !params.syncGoogle) return r;
    const sync = await syncBookedSession(r.session.id, r.session.empresaId ?? params.empresaId ?? -1);
    const [fresh] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, r.session.id));
    return { ...r, session: fresh ?? r.session, googleEventId: sync.eventId, googleSyncWarning: sync.warning };
  });
}
async function bookSessionLocked(params: BookParams, db: AgendaExecutor): Promise<BookResult> {
  const { resourceId, clientId, protocolId, date, time, serviceType, unit, simulate } = params;

  if (!HHMM.test(time)) return { ok: false, status: 400, error: "horário inválido (HH:mm)" };

  const computed = await computeResourceSlots(resourceId, date, null, db);
  if (!computed) return { ok: false, status: 404, error: "Agenda não encontrada" };
  if (!RESERVABLE_KINDS.has(computed.resource.kind)) {
    return { ok: false, status: 422, error: "Esta agenda é de uma categoria profissional sem reserva de procedimento habilitada. Nada foi agendado." };
  }

  const slot = computed.result.slots.find((s) => s.time === time);
  if (!slot) return { ok: false, status: 409, error: "Horário fora do expediente desta agenda" };
  if (slot.state === "ocupado") return { ok: false, status: 409, error: "Horário já ocupado" };
  if (slot.state === "bloqueado") {
    const motivo = blockReason(slot.reason);
    return { ok: false, status: 409, error: `Horário bloqueado: ${motivo}` };
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
  if (!client || client.empresaId !== params.empresaId) return { ok: false, status: 404, error: "Cliente não encontrado" };
  const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, protocolId));
  if (!protocol || protocol.clientId !== clientId) return { ok: false, status: 404, error: "Protocolo não pertence ao cliente" };

  // Guarda de corrida: reconsulta direta de ocupacao no exato recurso+data+hora,
  // imediatamente antes do insert, para estreitar a janela entre o motor e a gravacao.
  const [clash] = await db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.resourceId, resourceId),
        eq(sessionsTable.scheduledDate, date),
        eq(sessionsTable.scheduledTime, time),
        inArray(sessionsTable.status, ["scheduled", "confirmed", "completed"]),
      ),
    )
    .limit(1);
  if (clash) return { ok: false, status: 409, error: "Horário já ocupado" };

  const existing = await db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(eq(sessionsTable.protocolId, protocolId));
  const weekNumber = existing.length + 1;

  const notes = simulate ? SIM_TAG : null;
  const resourceName = computed.resource.name;

  const [session] = await db
    .insert(sessionsTable)
    .values({
      protocolId,
      clientId,
      resourceId,
      scheduledDate: date,
      scheduledTime: time,
      status: "scheduled",
      unit: unit ?? resourceName,
      serviceType: serviceType ?? (computed.resource.modality === "domiciliar" ? "home" : "clinic"),
      weekNumber,
      notes,
      empresaId: params.empresaId,
      professionalId: computed.resource.professionalId,
      durationMinutes: computed.resource.slotMinutes,
    })
    .returning();

  return { ok: true, status: 201, session, googleEventId: null };
}

export interface RescheduleParams {
  sessionId: number;
  clientId: number; // dono esperado (anti-IDOR: defesa em profundidade)
  resourceId: number;
  date: string;
  time: string;
  syncGoogle?: boolean;
}

/**
 * Move uma sessao JA existente (status "scheduled") para novo recurso/data/horario.
 * Valida pelo motor que o slot esta ABERTO, ignora a propria sessao na guarda de corrida,
 * grava a auditoria (contagem, quando, por quem) e MOVE o evento no Google Calendar
 * (remove o antigo + cria o novo). Falha de Google nunca trava a remarcacao.
 */
export async function rescheduleSession(params: RescheduleParams): Promise<BookResult> {
  if (!validDate(params.date)) return {ok:false,status:400,error:"Data inválida"};
  return db.transaction(async (tx) => {
    const empresaId = await lockAgendaResource(tx, params.resourceId);
    if (!empresaId) return {ok:false,status:404,error:"Agenda não encontrada"};
    return rescheduleSessionLocked(params, tx, empresaId);
  }).then(async ({ googleMove, ...r }): Promise<BookResult> => {
    if (!r.ok || !r.session || !googleMove) return r;
    const session = r.session;
    const acct = await verifyClinicAccount().catch(() => ({ ok: false, account: null as string | null }));
    if (!acct.ok) {
      return { ...r, googleSyncWarning: acct.account
        ? `Sincronização Google ignorada: a conta conectada (${acct.account}) não é a da clínica. Remarcação salva apenas no sistema.`
        : "Sincronização Google indisponível: conta da clínica não confirmada. Remarcação salva apenas no sistema." };
    }
    if (googleMove.oldEventId) {
      try { await deleteCalendarEvent(googleMove.oldEventId, googleMove.oldCalendarId || undefined); }
      catch { /* evento ja removido ou Google indisponivel: segue */ }
      await db.update(sessionsTable).set({ googleEventId: null, googleCalendarId: null }).where(eq(sessionsTable.id, session.id));
    }
    // Mesmo evento completo da marcação (procedimentos, substâncias, status, legenda, endereço da forma da agenda).
    const sync = await syncBookedSession(session.id, session.empresaId ?? -1);
    const [fresh] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, session.id));
    return { ...r, session: fresh ?? session, googleEventId: sync.eventId, googleSyncWarning: sync.warning
      ? sync.warning.replace("Marcação salva", "Remarcação salva") : undefined };
  });
}
async function rescheduleSessionLocked(params: RescheduleParams, db: AgendaExecutor, empresaId: number): Promise<BookResult> {
  const { sessionId, clientId, resourceId, date, time, syncGoogle } = params;

  if (!HHMM.test(time)) return { ok: false, status: 400, error: "horário inválido (HH:mm)" };

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId)).for("update");
  if (!session || session.agendaArchived || session.clientId !== clientId || session.empresaId !== empresaId) return { ok: false, status: 404, error: "Sessão não encontrada" };
  if (session.googleSyncPendingOperation) return { ok: false, status: 409, error: "A sincronização Google precisa ser concluída ou conferida antes da remarcação." };
  if (session.status !== "scheduled") return { ok: false, status: 409, error: "Só é possível remarcar sessões agendadas." };

  const computed = await computeResourceSlots(resourceId, date, null, db, sessionId);
  if (!computed) return { ok: false, status: 404, error: "Agenda não encontrada" };
  if (!RESERVABLE_KINDS.has(computed.resource.kind)) {
    return { ok: false, status: 422, error: "Esta agenda é de uma categoria profissional sem reserva de procedimento habilitada. Nada foi remarcado." };
  }

  const slot = computed.result.slots.find((s) => s.time === time);
  if (!slot) return { ok: false, status: 409, error: "Horário fora do expediente desta agenda" };
  if (slot.state === "ocupado") return { ok: false, status: 409, error: "Horário já ocupado" };
  if (slot.state === "bloqueado") {
    const motivo = blockReason(slot.reason);
    return { ok: false, status: 409, error: `Horário bloqueado: ${motivo}` };
  }

  // Visita de protocolo reserva varios periodos seguidos: remarcar nunca encolhe a duracao reservada e o trecho
  // inteiro precisa estar livre no novo dia. Sessao avulsa (duracao = um periodo) segue exatamente como antes.
  const slotMinutes = computed.resource.slotMinutes;
  const reservedMinutes = session.resourceId && session.durationMinutes && session.durationMinutes > 0
    ? session.durationMinutes : slotMinutes;
  const neededPeriods = Math.max(1, Math.ceil(reservedMinutes / slotMinutes));
  const newDuration = neededPeriods * slotMinutes;
  if (neededPeriods > 1) {
    const [hh, mm] = time.split(":").map(Number);
    const byTime = new Map(computed.result.slots.map((s) => [s.time, s]));
    for (let i = 1; i < neededPeriods; i++) {
      const minutes = hh * 60 + mm + i * slotMinutes;
      const t = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      const next = byTime.get(t);
      if (!next || next.state !== "aberto") {
        return { ok: false, status: 409,
          error: `A visita reserva ${newDuration} minutos seguidos e o horário das ${t} não está livre nesse dia` };
      }
    }
  }

  // Guarda de corrida: ocupacao no exato recurso+data+hora, IGNORANDO a propria sessao.
  const clashRows = await db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.resourceId, resourceId),
        eq(sessionsTable.scheduledDate, date),
        eq(sessionsTable.scheduledTime, time),
        inArray(sessionsTable.status, ["scheduled", "confirmed", "completed"]),
      ),
    );
  if (clashRows.some((r) => r.id !== sessionId)) return { ok: false, status: 409, error: "Horário já ocupado" };

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
  if (!client) return { ok: false, status: 404, error: "Cliente não encontrado" };

  const resourceName = computed.resource.name;
  const newServiceType = computed.resource.modality === "domiciliar" ? "home" : "clinic";

  const sameResource = session.resourceId === resourceId;
  const [hasApplication] = await db.select({ id: substanceApplicationsTable.id }).from(substanceApplicationsTable)
    .where(eq(substanceApplicationsTable.sessionId, sessionId)).limit(1);
  // Visita de protocolo ja no Google, na mesma agenda Google: o evento (com todas as aplicacoes na descricao)
  // e atualizado no lugar, com o mesmo identificador, e nao apagado/recriado como evento generico.
  const updateInPlace = !!session.googleEventId && !!hasApplication && !!session.googleCalendarId &&
    session.googleCalendarId === (computed.resource.googleCalendarId || null);

  // MOVE no Google (agenda ou calendário diferente, ou visita ainda sem aplicações): feito FORA da transação, depois
  // da remarcação gravada, por rescheduleSession. Aqui só se anota qual evento antigo precisa sair.
  const googleEventId: string | null = session.googleEventId ?? null;
  const googleCalendarId: string | null = session.googleCalendarId ?? null;
  let googleSyncWarning: string | undefined;
  const googleMove = syncGoogle && !updateInPlace
    ? { oldEventId: session.googleEventId ?? null, oldCalendarId: session.googleCalendarId ?? null } : undefined;

  // Remarcação sem sincronização (rota de edição) de visita que está no Google mas não pode seguir no mesmo evento
  // (calendário diferente ou sem aplicações): o evento antigo fica no dia e horário velhos. Avisa, nunca finge que seguiu.
  if (!syncGoogle && session.googleEventId && !updateInPlace) {
    googleSyncWarning = "Remarcação salva, mas o evento no Google Agenda continua no dia e horário antigos (a agenda ou o calendário da visita não permite atualizar o mesmo evento). Ajuste o evento manualmente no Google.";
  }

  const [updated] = await db
    .update(sessionsTable)
    .set({
      resourceId,
      // Na mesma agenda a visita mantem profissional, unidade e tipo gravados na reserva (agenda de enfermagem nao
      // tem profissional proprio: sobrescrever apagaria o do protocolo). Em outra agenda, vale o da nova agenda.
      professionalId: sameResource ? (computed.resource.professionalId ?? session.professionalId) : computed.resource.professionalId,
      durationMinutes: newDuration,
      scheduledDate: date,
      scheduledTime: time,
      unit: sameResource && session.unit ? session.unit : resourceName,
      serviceType: sameResource && session.serviceType ? session.serviceType : newServiceType,
      googleEventId,
      googleCalendarId,
      rescheduleCount: (session.rescheduleCount ?? 0) + 1,
      rescheduledAt: new Date().toISOString(),
      rescheduledBy: "cliente",
    })
    .where(eq(sessionsTable.id, sessionId))
    .returning();

  return { ok: true, status: 200, session: updated, googleEventId, googleSyncWarning, googleRefreshNeeded: updateInPlace, googleMove };
}

export async function cancelBooking(sessionId: number, empresaId?: number): Promise<BookResult> {
  return db.transaction(async tx => {
    const [session] = await tx.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId)).for("update");
    if (!session || session.agendaArchived || (empresaId != null && session.empresaId !== empresaId)) return { ok: false, status: 404, error: "Sessão não encontrada" };
    if (session.googleSyncPendingOperation) return { ok: false, status: 409, error: "A sincronização Google precisa ser concluída ou conferida antes do cancelamento." };

    // O cancelamento no sistema vale sempre. Evento que ja nao existe (404/410) conta como removido; falha real do
    // Google MANTEM o ponteiro (nunca se perde o rastro de um evento que continua na agenda) e avisa.
    let removedFromGoogle = true;
    let googleSyncWarning: string | undefined;
    if (session.googleEventId) {
      // Conta errada vê 404 num calendário que não enxerga: sem confirmar a conta da clínica, "404" não prova remoção.
      let accountConfirmed = false;
      try { accountConfirmed = (await verifyClinicAccount()).ok; } catch { accountConfirmed = false; }
      if (!accountConfirmed) {
        removedFromGoogle = false;
        googleSyncWarning = "Visita cancelada no sistema, mas a conta Google da clínica não foi confirmada e o evento continua na agenda. Apague-o manualmente ou repita o cancelamento depois.";
      } else {
        try {
          await deleteCalendarEvent(session.googleEventId, session.googleCalendarId || undefined);
        } catch (error: any) {
          const gone = [404, 410].includes(error?.code) || [404, 410].includes(error?.status) ||
            [404, 410].includes(error?.response?.status);
          if (!gone) {
            removedFromGoogle = false;
            googleSyncWarning = "Visita cancelada no sistema, mas o evento no Google Agenda não pôde ser removido e continua lá. Apague-o manualmente na agenda.";
          }
        }
      }
    }

    const [updated] = await tx.update(sessionsTable)
      .set(removedFromGoogle ? { status: "cancelled", googleEventId: null, googleCalendarId: null } : { status: "cancelled" })
      .where(eq(sessionsTable.id, sessionId)).returning();

    return { ok: true, status: 200, session: updated, googleSyncWarning };
  });
}

/**
 * Oculta apenas simulações da empresa selecionada, preservando registros e Google.
 */
export async function clearSimulations(
  scope: { empresaId: number; clientId?: number; protocolId?: number },
): Promise<{ removed: number; googleRemoved: number; awaitingReview: number }> {
  const filters = [eq(sessionsTable.notes, SIM_TAG), eq(sessionsTable.empresaId, scope.empresaId)];
  if (scope?.clientId != null) filters.push(eq(sessionsTable.clientId, scope.clientId));
  if (scope?.protocolId != null) filters.push(eq(sessionsTable.protocolId, scope.protocolId));
  const where = and(...filters);

  return db.transaction(async tx => {
    const sims = await tx.select().from(sessionsTable).where(where).for("update");
    const eligible = sims.filter(s => !s.agendaArchived && !s.googleSyncPendingOperation);
    if (eligible.length) await tx.update(sessionsTable).set({ agendaArchived: true })
      .where(inArray(sessionsTable.id, eligible.map(s => s.id)));
    return { removed: eligible.length, googleRemoved: 0,
      awaitingReview: sims.filter(s => !!s.googleSyncPendingOperation).length };
  });
}
