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
} from "@workspace/db";
import { loadAgendaOccupancy, type AgendaExecutor } from "./agenda-occupancy";
import { windowOccursOnDate } from "./agenda-window-recurrence";
import { computeAgendaSlots, type EngineResult } from "./agenda-motor.js";
import { createCalendarEvent, deleteCalendarEvent, verifyClinicAccount } from "./google-calendar.js";

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
export const SIM_TAG = "[SIMULACAO]";

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
      minLeadHours: settings.minLeadHours,
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
  const result = await executor.execute(sql`SELECT l.empresa_id FROM agenda_resources r
    JOIN locations l ON l.id=r.location_id WHERE r.id=${resourceId} AND r.active AND l.active='true'`);
  const empresaId = Number(result.rows[0]?.empresa_id);
  if (!empresaId) return null;
  await executor.execute(sql`SELECT pg_advisory_xact_lock(19872026,${empresaId})`);
  return empresaId;
}

/**
 * Marca uma sessao num slot. Valida pelo motor que o horario esta ABERTO (reconsulta
 * a ocupacao real para evitar corrida). Opcionalmente sincroniza com o Google Calendar.
 */
export async function bookSession(params: BookParams): Promise<BookResult> {
  if (!validDate(params.date)) return {ok:false,status:400,error:"Data inválida"};
  return db.transaction(async (tx) => {
    const empresaId = await lockAgendaResource(tx, params.resourceId);
    if (!empresaId || (params.empresaId && params.empresaId !== empresaId)) return {ok:false,status:404,error:"Recurso não encontrado"};
    return bookSessionLocked({...params, empresaId}, tx);
  });
}
async function bookSessionLocked(params: BookParams, db: AgendaExecutor): Promise<BookResult> {
  const { resourceId, clientId, protocolId, date, time, serviceType, unit, syncGoogle, simulate } = params;

  if (!HHMM.test(time)) return { ok: false, status: 400, error: "horário inválido (HH:mm)" };

  const computed = await computeResourceSlots(resourceId, date, null, db);
  if (!computed) return { ok: false, status: 404, error: "Recurso não encontrado" };

  const slot = computed.result.slots.find((s) => s.time === time);
  if (!slot) return { ok: false, status: 409, error: "Horário fora do expediente deste recurso" };
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

  let googleEventId: string | null = null;
  let googleSyncWarning: string | undefined;
  if (syncGoogle) {
    // BLOQUEIO: so empurra se a conta Google conectada for a da clinica.
    const acct = await verifyClinicAccount();
    if (!acct.ok) {
      googleSyncWarning = acct.account
        ? `Sincronização Google ignorada: a conta conectada (${acct.account}) não é a da clínica. Marcação salva apenas no sistema.`
        : "Sincronização Google indisponível: conta da clínica não confirmada. Marcação salva apenas no sistema.";
    } else {
    try {
      const resourceCalendarId = computed.resource.googleCalendarId || undefined;
      googleEventId = await createCalendarEvent({
        sessionId: session.id,
        clientName: client.name,
        clientCpf: client.cpf ?? undefined,
        scheduledDate: date,
        scheduledTime: time,
        durationMinutes: computed.resource.slotMinutes,
        weekNumber,
        unit: unit ?? resourceName,
        procedureLabel: resourceName,
        procedureType: computed.resource.kind === "medico" ? "consultation" : "iv",
        activeProcedureTypes: [computed.resource.kind === "medico" ? "consultation" : "iv"],
        substances: [],
        clientEmail: client.email || undefined,
        sessionStatus: "scheduled",
        summaryPrefix: simulate ? SIM_TAG : undefined,
        calendarId: resourceCalendarId,
      });
      if (googleEventId) {
        await db.update(sessionsTable)
          .set({ googleEventId, googleCalendarId: resourceCalendarId ?? null })
          .where(eq(sessionsTable.id, session.id));
      }
    } catch (err: any) {
      // Nao quebra a marcacao: a sessao fica criada no sistema; sincronizacao falha em silencio controlado.
      googleEventId = null;
      googleSyncWarning = "Marcação salva, mas a sincronização com o Google Agenda falhou.";
    }
    }
  }

  return { ok: true, status: 201, session: { ...session, googleEventId }, googleEventId, googleSyncWarning };
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
    if (!empresaId) return {ok:false,status:404,error:"Recurso não encontrado"};
    return rescheduleSessionLocked(params, tx, empresaId);
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
  if (!computed) return { ok: false, status: 404, error: "Recurso não encontrado" };

  const slot = computed.result.slots.find((s) => s.time === time);
  if (!slot) return { ok: false, status: 409, error: "Horário fora do expediente deste recurso" };
  if (slot.state === "ocupado") return { ok: false, status: 409, error: "Horário já ocupado" };
  if (slot.state === "bloqueado") {
    const motivo = blockReason(slot.reason);
    return { ok: false, status: 409, error: `Horário bloqueado: ${motivo}` };
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

  // MOVE no Google: remove o antigo e cria o novo. So empurra se a conta for a da clinica.
  let googleEventId: string | null = session.googleEventId ?? null;
  let googleCalendarId: string | null = session.googleCalendarId ?? null;
  let googleSyncWarning: string | undefined;
  if (syncGoogle) {
    const acct = await verifyClinicAccount();
    if (!acct.ok) {
      googleSyncWarning = acct.account
        ? `Sincronização Google ignorada: a conta conectada (${acct.account}) não é a da clínica. Remarcação salva apenas no sistema.`
        : "Sincronização Google indisponível: conta da clínica não confirmada. Remarcação salva apenas no sistema.";
    } else {
      try {
        if (session.googleEventId) {
          try {
            await deleteCalendarEvent(session.googleEventId, session.googleCalendarId || undefined);
          } catch {
            /* evento ja removido ou Google indisponivel: segue */
          }
        }
        const resourceCalendarId = computed.resource.googleCalendarId || undefined;
        googleEventId = await createCalendarEvent({
          sessionId: session.id,
          clientName: client.name,
          clientCpf: client.cpf ?? undefined,
          scheduledDate: date,
          scheduledTime: time,
          durationMinutes: computed.resource.slotMinutes,
          weekNumber: session.weekNumber,
          unit: resourceName,
          procedureLabel: resourceName,
          procedureType: computed.resource.kind === "medico" ? "consultation" : "iv",
          activeProcedureTypes: [computed.resource.kind === "medico" ? "consultation" : "iv"],
          substances: [],
          clientEmail: client.email || undefined,
          sessionStatus: "scheduled",
          calendarId: resourceCalendarId,
        });
        googleCalendarId = resourceCalendarId ?? null;
      } catch {
        // O evento antigo ja foi (ou pode ter sido) removido acima e o novo nao foi criado:
        // limpar o ponteiro evita deixar um google_event_id orfao para sincronizacoes futuras.
        googleEventId = null;
        googleCalendarId = null;
        googleSyncWarning = "Remarcação salva, mas a sincronização com o Google Agenda falhou.";
      }
    }
  }

  const [updated] = await db
    .update(sessionsTable)
    .set({
      resourceId,
      professionalId: computed.resource.professionalId,
      durationMinutes: computed.resource.slotMinutes,
      scheduledDate: date,
      scheduledTime: time,
      unit: resourceName,
      serviceType: newServiceType,
      googleEventId,
      googleCalendarId,
      rescheduleCount: (session.rescheduleCount ?? 0) + 1,
      rescheduledAt: new Date().toISOString(),
      rescheduledBy: "cliente",
    })
    .where(eq(sessionsTable.id, sessionId))
    .returning();

  return { ok: true, status: 200, session: updated, googleEventId, googleSyncWarning };
}

export async function cancelBooking(sessionId: number, empresaId?: number): Promise<BookResult> {
  return db.transaction(async tx => {
    const [session] = await tx.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId)).for("update");
    if (!session || session.agendaArchived || (empresaId != null && session.empresaId !== empresaId)) return { ok: false, status: 404, error: "Sessão não encontrada" };
    if (session.googleSyncPendingOperation) return { ok: false, status: 409, error: "A sincronização Google precisa ser concluída ou conferida antes do cancelamento." };

    if (session.googleEventId) {
      try {
        await deleteCalendarEvent(session.googleEventId, session.googleCalendarId || undefined);
      } catch {
        /* evento ja removido ou Google indisponivel: segue cancelando no sistema */
      }
    }

    const [updated] = await tx.update(sessionsTable)
      .set({ status: "cancelled", googleEventId: null })
      .where(eq(sessionsTable.id, sessionId)).returning();

    return { ok: true, status: 200, session: updated };
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
