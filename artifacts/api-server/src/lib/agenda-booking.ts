import { and, eq, or, isNull, inArray } from "drizzle-orm";
import {
  db,
  sessionsTable,
  agendaResourcesTable,
  agendaWindowsTable,
  agendaExceptionsTable,
  agendaSettingsTable,
  clientsTable,
  type Session,
} from "@workspace/db";
import { computeAgendaSlots, type EngineResult } from "./agenda-motor.js";
import { createCalendarEvent, deleteCalendarEvent, verifyClinicAccount } from "./google-calendar.js";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const SIM_TAG = "[SIMULACAO]";

async function getSettings() {
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
): Promise<{ resource: typeof agendaResourcesTable.$inferSelect; result: EngineResult } | null> {
  const [resource] = await db.select().from(agendaResourcesTable).where(eq(agendaResourcesTable.id, resourceId));
  if (!resource) return null;

  const settings = await getSettings();
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();

  const windows = await db
    .select()
    .from(agendaWindowsTable)
    .where(and(eq(agendaWindowsTable.resourceId, resourceId), eq(agendaWindowsTable.weekday, weekday)));

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
          inArray(sessionsTable.status, ["scheduled", "completed"]),
        ),
      );
    occupiedTimes = new Set<string>(booked.map((b) => String(b.time).slice(0, 5)).filter((t) => HHMM.test(t)));
  }

  const result = computeAgendaSlots({
    windows: windows.map((w) => ({ startTime: w.startTime, endTime: w.endTime })),
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
  });

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
}

/**
 * Marca uma sessao num slot. Valida pelo motor que o horario esta ABERTO (reconsulta
 * a ocupacao real para evitar corrida). Opcionalmente sincroniza com o Google Calendar.
 */
export async function bookSession(params: BookParams): Promise<BookResult> {
  const { resourceId, clientId, protocolId, date, time, serviceType, unit, syncGoogle, simulate } = params;

  if (!HHMM.test(time)) return { ok: false, status: 400, error: "horário inválido (HH:mm)" };

  const computed = await computeResourceSlots(resourceId, date, null);
  if (!computed) return { ok: false, status: 404, error: "Recurso não encontrado" };

  const slot = computed.result.slots.find((s) => s.time === time);
  if (!slot) return { ok: false, status: 409, error: "Horário fora do expediente deste recurso" };
  if (slot.state === "ocupado") return { ok: false, status: 409, error: "Horário já ocupado" };
  if (slot.state === "bloqueado") {
    const motivo = slot.reason === "antecedencia" ? "dentro da antecedência mínima" : "ainda não liberado (cadeia)";
    return { ok: false, status: 409, error: `Horário bloqueado: ${motivo}` };
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
  if (!client) return { ok: false, status: 404, error: "Cliente não encontrado" };

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
        inArray(sessionsTable.status, ["scheduled", "completed"]),
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
        clientCpf: client.cpf,
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

export async function cancelBooking(sessionId: number): Promise<BookResult> {
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!session) return { ok: false, status: 404, error: "Sessão não encontrada" };

  if (session.googleEventId) {
    try {
      await deleteCalendarEvent(session.googleEventId, session.googleCalendarId || undefined);
    } catch {
      /* evento ja removido ou Google indisponivel: segue cancelando no sistema */
    }
  }

  const [updated] = await db
    .update(sessionsTable)
    .set({ status: "cancelled", googleEventId: null })
    .where(eq(sessionsTable.id, sessionId))
    .returning();

  return { ok: true, status: 200, session: updated };
}

/**
 * Remove a poluicao da demo: apaga eventos Google e exclui as sessoes etiquetadas [SIMULACAO].
 * So toca sessoes com a tag de simulacao (nunca marcacoes reais). Aceita escopo opcional
 * (clientId/protocolId) para restringir a demo de um cliente especifico, ex.: a Carlucia.
 */
export async function clearSimulations(
  scope?: { clientId?: number; protocolId?: number },
): Promise<{ removed: number; googleRemoved: number }> {
  const filters = [eq(sessionsTable.notes, SIM_TAG)];
  if (scope?.clientId != null) filters.push(eq(sessionsTable.clientId, scope.clientId));
  if (scope?.protocolId != null) filters.push(eq(sessionsTable.protocolId, scope.protocolId));
  const where = and(...filters);

  const sims = await db.select().from(sessionsTable).where(where);
  let googleRemoved = 0;
  for (const s of sims) {
    if (s.googleEventId) {
      try {
        await deleteCalendarEvent(s.googleEventId, s.googleCalendarId || undefined);
        googleRemoved++;
      } catch {
        /* ignora falha de remocao no Google */
      }
    }
  }
  if (sims.length > 0) {
    await db.delete(sessionsTable).where(where);
  }
  return { removed: sims.length, googleRemoved };
}
