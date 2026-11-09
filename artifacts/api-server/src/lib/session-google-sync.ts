import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import {
  agendaResourcesTable, clientsTable, db, locationProfessionalsTable, locationsTable, protocolsTable,
  sessionsTable, substanceApplicationsTable, substancesTable,
} from "@workspace/db";
import { estadoAplicacao } from "./estado-aplicacao-protocolo";
import {
  calendarEventExists, createCalendarEvent, deleteCalendarEvent, updateCalendarEvent, verifyClinicAccount,
  type CalendarEventData, type CalendarSubstance,
} from "./google-calendar";

/**
 * Envio das visitas de um protocolo ao Google Agenda (etapa 5 de 7).
 *
 * Princípios (decisão do dono):
 *  - o sistema é a fonte da verdade; o Google é cópia. Falha do Google NUNCA desfaz a reserva;
 *  - UM evento por visita (sessão), com todas as substâncias da visita na descrição;
 *  - sem participante (attendee) e sem convite: a criação usa sendUpdates "none" (google-calendar.ts);
 *  - o MESMO evento é atualizado depois (identificador reservado antes do envio);
 *  - resultado incerto nunca autoriza criar outro evento: a conferência reaproveita o identificador reservado.
 */

export function procedureTypeLabel(type: string): string {
  switch (type) {
    case "iv": return "Aplicacao Endovenosa";
    case "im": return "Aplicacao Intramuscular";
    case "sc": return "Aplicacao Subcutanea";
    case "implant": return "Implante";
    default: return "Procedimento";
  }
}


export class CalendarSyncUncertain extends Error {}

/** Reserva durável: mesmo falha de resposta ou reinício nunca autoriza nova criação. */
export async function syncReservedEvent(
  session: typeof sessionsTable.$inferSelect,
  data: CalendarEventData,
  expectedApplications: (typeof substanceApplicationsTable.$inferSelect)[],
) {
  const operation = randomUUID();
  const eventId = session.googleEventId ?? randomUUID().replace(/-/g, "");
  const calendarId = data.calendarId!;
  const [reserved] = await db.update(sessionsTable).set({
    googleSyncPendingOperation: operation,
    googleSyncPendingEventId: eventId,
    googleSyncPendingCalendarId: calendarId,
  }).where(and(
    eq(sessionsTable.id, session.id),
    isNull(sessionsTable.googleSyncPendingOperation),
    session.googleEventId ? eq(sessionsTable.googleEventId, session.googleEventId) : isNull(sessionsTable.googleEventId),
  )).returning({ id: sessionsTable.id });
  if (!reserved) throw new CalendarSyncUncertain("Há uma sincronização em andamento ou com resultado incerto. Confira antes de repetir.");

  // A descrição pode ter sido montada antes da reserva. Depois da reserva,
  // confirme que a sessão e suas aplicações ainda são exatamente as mesmas.
  const stripReservation = (s: typeof sessionsTable.$inferSelect) => {
    const { googleSyncPendingOperation: _op, googleSyncPendingEventId: _id,
      googleSyncPendingCalendarId: _calendar, ...rest } = s;
    return JSON.stringify(rest);
  };
  const serializeApplications = (items: (typeof substanceApplicationsTable.$inferSelect)[]) =>
    JSON.stringify([...items].sort((a, b) => a.id - b.id));
  const [fresh] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, session.id));
  const freshApplications = await db.select().from(substanceApplicationsTable)
    .where(eq(substanceApplicationsTable.sessionId, session.id));
  if (!fresh || stripReservation(fresh) !== stripReservation(session) ||
      serializeApplications(freshApplications) !== serializeApplications(expectedApplications)) {
    await db.update(sessionsTable).set({
      googleSyncPendingOperation: null, googleSyncPendingEventId: null, googleSyncPendingCalendarId: null,
    }).where(and(eq(sessionsTable.id, session.id), eq(sessionsTable.googleSyncPendingOperation, operation)));
    throw new CalendarSyncUncertain("A sessão mudou antes do envio. Nenhum evento foi alterado; confira e tente novamente.");
  }
  try {
    if (session.googleEventId) {
      await updateCalendarEvent(eventId, calendarId, data);
    } else {
      const created = await createCalendarEvent({ ...data, eventId });
      if (created !== eventId) throw new Error("O Google não confirmou o identificador reservado.");
    }
    const [saved] = await db.update(sessionsTable).set({
      googleEventId: eventId,
      googleCalendarId: calendarId,
      googleSyncPendingOperation: null,
      googleSyncPendingEventId: null,
      googleSyncPendingCalendarId: null,
    }).where(and(eq(sessionsTable.id, session.id), eq(sessionsTable.googleSyncPendingOperation, operation)))
      .returning({ id: sessionsTable.id });
    if (!saved) throw new Error("A reserva não foi encontrada para registrar o resultado.");
    return eventId;
  } catch {
    // Não libera a reserva: o Google pode ter recebido a alteração.
    throw new CalendarSyncUncertain("Não foi possível confirmar o resultado no Google. Confira o compromisso antes de repetir.");
  }
}


type SessionRow = typeof sessionsTable.$inferSelect;
type ApplicationRow = typeof substanceApplicationsTable.$inferSelect;

/** Mesmas visões comparadas antes de qualquer envio: a sessão e suas aplicações não podem ter mudado. */
function sessionFingerprint(s: SessionRow): string {
  const { googleSyncPendingOperation: _op, googleSyncPendingEventId: _id, googleSyncPendingCalendarId: _cal, ...rest } = s;
  return JSON.stringify(rest);
}
const applicationsFingerprint = (items: ApplicationRow[]) => JSON.stringify([...items].sort((a, b) => a.id - b.id));

/**
 * Conferência de uma sincronização que ficou com resultado incerto (falha de rede, erro do Google,
 * reinício do servidor). Reaproveita o identificador JÁ reservado: se o evento existe, atualiza; se não
 * existe, cria com o mesmo identificador. Nunca gera identificador novo, então nunca duplica o evento.
 */
export async function reconcilePendingEvent(
  session: SessionRow,
  data: CalendarEventData,
  expectedApplications: ApplicationRow[],
): Promise<string> {
  const previousOperation = session.googleSyncPendingOperation;
  const eventId = session.googleSyncPendingEventId;
  const calendarId = data.calendarId!;
  if (!previousOperation || !eventId || session.googleSyncPendingCalendarId !== calendarId) {
    throw new CalendarSyncUncertain("A agenda Google da sessão mudou durante uma sincronização incerta; a conferência manual é necessária.");
  }
  const operation = randomUUID();
  const [taken] = await db.update(sessionsTable).set({ googleSyncPendingOperation: operation })
    .where(and(eq(sessionsTable.id, session.id), eq(sessionsTable.googleSyncPendingOperation, previousOperation)))
    .returning({ id: sessionsTable.id });
  if (!taken) throw new CalendarSyncUncertain("Outra conferência desta sessão está em andamento.");

  const [fresh] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, session.id));
  const freshApplications = await db.select().from(substanceApplicationsTable)
    .where(eq(substanceApplicationsTable.sessionId, session.id));
  if (!fresh || sessionFingerprint(fresh) !== sessionFingerprint(session) ||
      applicationsFingerprint(freshApplications) !== applicationsFingerprint(expectedApplications)) {
    // Nada foi enviado nesta tentativa: devolve a reserva anterior, que continua incerta.
    await db.update(sessionsTable).set({ googleSyncPendingOperation: previousOperation })
      .where(and(eq(sessionsTable.id, session.id), eq(sessionsTable.googleSyncPendingOperation, operation)));
    throw new CalendarSyncUncertain("A sessão mudou antes da conferência. Nenhum evento foi alterado.");
  }
  try {
    if (await calendarEventExists(eventId, calendarId)) {
      await updateCalendarEvent(eventId, calendarId, data);
    } else {
      const created = await createCalendarEvent({ ...data, eventId });
      if (created !== eventId) throw new Error("O Google não confirmou o identificador reservado.");
    }
    const [saved] = await db.update(sessionsTable).set({
      googleEventId: eventId, googleCalendarId: calendarId,
      googleSyncPendingOperation: null, googleSyncPendingEventId: null, googleSyncPendingCalendarId: null,
    }).where(and(eq(sessionsTable.id, session.id), eq(sessionsTable.googleSyncPendingOperation, operation)))
      .returning({ id: sessionsTable.id });
    if (!saved) throw new Error("A reserva não foi encontrada para registrar o resultado.");
    return eventId;
  } catch {
    throw new CalendarSyncUncertain("Não foi possível confirmar o resultado no Google. A conferência pode ser repetida com o mesmo identificador.");
  }
}

export type VisitSyncStatus = "sincronizado" | "ja_sincronizado" | "falhou" | "incerto" | "nao_processada";
export interface VisitSyncResult {
  sessionId: number; date: string; time: string; status: VisitSyncStatus;
  eventId?: string; code?: string; error?: string;
}
export type ProtocolGoogleSyncResult =
  | { ok: true; visits: VisitSyncResult[]; synced: number; alreadySynced: number; failed: number; remaining: number }
  | { ok: false; status: 404 | 409 | 503; code: string; error: string };

export interface ProtocolGoogleSyncParams {
  empresaId: number; clientId: number; protocolId: number;
  /** Profissional logado: precisa pertencer ao local da agenda (mesma regra do envio avulso). */
  professionalId: number;
  /** Atualiza também os eventos já enviados (mesmo evento, mesmo identificador). */
  refresh?: boolean;
  /** Reconferência do acesso antes de cada visita (o laço leva alguns segundos por visita). */
  stillAuthorized?: () => Promise<boolean>;
}

/** Limite por chamada: cada visita pode levar 1 a 2 s no Google e a resposta HTTP precisa voltar. */
export const MAX_VISITS_PER_GOOGLE_SYNC = 40;

type Destination =
  | { ok: true; resourceKind: string; location: typeof locationsTable.$inferSelect; calendarId: string }
  | { ok: false; code: string; error: string };

/** `professionalId` nulo = o chamador já autorizou a sessão (ex.: atualização depois de remarcar); não confere vínculo. */
async function resolveDestination(session: SessionRow, empresaId: number, professionalId: number | null): Promise<Destination> {
  return resolveResourceDestination(session.resourceId, empresaId, professionalId);
}

async function resolveResourceDestination(resourceId: number | null, empresaId: number, professionalId: number | null): Promise<Destination> {
  if (!resourceId) {
    return { ok: false, code: "visita_sem_agenda", error: "Visita no formato antigo, sem agenda de enfermagem; não foi enviada." };
  }
  const [resource] = await db.select().from(agendaResourcesTable).where(eq(agendaResourcesTable.id, resourceId));
  if (!resource?.active) return { ok: false, code: "agenda_inativa", error: "A agenda desta visita está inativa." };
  if (!resource.googleCalendarId) {
    return { ok: false, code: "agenda_sem_google", error: "A agenda desta visita não tem calendário Google configurado." };
  }
  if (!resource.locationId) return { ok: false, code: "agenda_sem_local", error: "A agenda desta visita não está ligada a um local." };
  const [location] = await db.select().from(locationsTable).where(eq(locationsTable.id, resource.locationId));
  if (!location || location.active !== "true" || location.empresaId !== empresaId) {
    return { ok: false, code: "local_invalido", error: "O local da agenda está inativo ou pertence a outra clínica." };
  }
  if (professionalId !== null) {
    const [membership] = await db.select().from(locationProfessionalsTable).where(and(
      eq(locationProfessionalsTable.locationId, location.id),
      eq(locationProfessionalsTable.professionalId, professionalId),
    ));
    if (!membership) {
      return { ok: false, code: "sem_vinculo_local", error: "O profissional logado não está vinculado ao local da agenda." };
    }
  }
  return { ok: true, resourceKind: resource.kind, location, calendarId: resource.googleCalendarId };
}

/**
 * Aviso ANTES de agendar: o envio ao Google vai funcionar para esta agenda e este profissional? Usa exatamente a mesma
 * regra do envio (um só lugar), sem gravar nem chamar o Google. A reserva no sistema vale de qualquer forma; o aviso só
 * evita descobrir depois do agendamento que o Google não receberá os eventos. Nulo = pronto.
 */
export async function googleReadinessWarning(
  resourceId: number, empresaId: number, professionalId: number,
): Promise<{ code: string; message: string } | null> {
  try {
    const destination = await resolveResourceDestination(resourceId, empresaId, professionalId);
    if (destination.ok) return null;
    return { code: destination.code,
      message: `O agendamento ficará salvo no sistema, mas o envio ao Google Agenda não vai funcionar: ${destination.error} Corrija o cadastro antes ou envie depois.` };
  } catch {
    return { code: "verificacao_indisponivel",
      message: "Não foi possível verificar se o envio ao Google Agenda está pronto. O agendamento ficará salvo no sistema." };
  }
}

/** Evento de uma visita: todas as aplicações da sessão viram a lista de substâncias da descrição. */
async function buildVisitEvent(
  session: SessionRow, client: typeof clientsTable.$inferSelect, destination: Extract<Destination, { ok: true }>,
  applications: ApplicationRow[], position: number, totalVisits: number,
): Promise<{ ok: true; data: CalendarEventData } | { ok: false; code: string; error: string }> {
  if (!session.durationMinutes || session.durationMinutes <= 0) {
    return { ok: false, code: "visita_sem_duracao", error: "A visita não tem duração gravada." };
  }
  if (applications.length === 0) {
    return { ok: false, code: "visita_sem_aplicacoes", error: "A visita não tem aplicações; nenhum evento foi enviado." };
  }
  const substances: CalendarSubstance[] = [];
  const dispTypes = new Set<string>();
  let primaryType = "";
  for (const app of applications) {
    const [substance] = await db.select().from(substancesTable).where(eq(substancesTable.id, app.substanceId));
    if (!substance || (app.availability === "disp" && !substance.procedureType)) {
      return { ok: false, code: "substancia_sem_via", error: "Substância ou via não identificada; nenhum evento foi enviado." };
    }
    substances.push({
      name: substance.name, dose: app.dose, sessionNumber: app.sessionNumber,
      totalSessions: app.totalSessions, status: estadoAplicacao(app),
    });
    if (app.availability === "disp") {
      primaryType = substance.procedureType!;
      dispTypes.add(substance.procedureType!);
    }
  }
  if (!primaryType) {
    return { ok: false, code: "procedimento_indefinido", error: "Procedimento da visita não identificado; nenhum evento foi enviado." };
  }
  const location = destination.location;
  const itinerant = location.address?.toLowerCase().includes("itinerante") ||
    session.unit?.toLowerCase().includes("domiciliar") || session.unit?.toLowerCase().includes("nurse care");
  return {
    ok: true,
    data: {
      sessionId: session.id, clientName: client.name, clientCpf: client.cpf ?? undefined,
      scheduledDate: session.scheduledDate, scheduledTime: session.scheduledTime,
      durationMinutes: session.durationMinutes,
      // "Agendamento Número n/total": posição cronológica entre as visitas ATIVAS do protocolo. O número gravado na
      // sessão não acompanha cancelamento nem remarcação e geraria "3/2" na descrição.
      weekNumber: position, totalAppointments: totalVisits,
      unit: session.unit ?? location.name,
      locationAddress: itinerant && client.address ? client.address : location.address ?? undefined,
      locationPhone: location.phone ?? undefined, calendarId: destination.calendarId,
      procedureType: primaryType, procedureLabel: procedureTypeLabel(primaryType),
      activeProcedureTypes: Array.from(dispTypes), substances,
      // Só para a descrição: o envio nunca cria participante nem convite (sendUpdates "none").
      clientEmail: client.email || undefined,
      sessionStatus: session.status, rescheduleCount: session.rescheduleCount,
    },
  };
}

interface VisitContext {
  empresaId: number; professionalId: number | null; client: typeof clientsTable.$inferSelect;
  position: number; total: number;
}

/** Uma visita: destino, evento completo e envio seguro (reserva -> Google -> grava). Nunca lança. */
async function syncVisit(session: SessionRow, ctx: VisitContext): Promise<VisitSyncResult> {
  const base = { sessionId: session.id, date: session.scheduledDate, time: session.scheduledTime };
  const destination = await resolveDestination(session, ctx.empresaId, ctx.professionalId);
  if (!destination.ok) return { ...base, status: "falhou", code: destination.code, error: destination.error };
  if (session.googleEventId && session.googleCalendarId !== destination.calendarId) {
    return { ...base, status: "falhou", code: "outra_agenda_google",
      error: "A visita pertence a outra agenda Google; a transferência exige conferência e não foi feita." };
  }
  const applications = await db.select().from(substanceApplicationsTable).where(eq(substanceApplicationsTable.sessionId, session.id));
  const built = await buildVisitEvent(session, ctx.client, destination, applications, ctx.position, ctx.total);
  if (!built.ok) return { ...base, status: "falhou", code: built.code, error: built.error };
  try {
    const eventId = session.googleSyncPendingOperation
      ? await reconcilePendingEvent(session, built.data, applications)
      : await syncReservedEvent(session, built.data, applications);
    return { ...base, status: "sincronizado", eventId };
  } catch (error) {
    const uncertain = error instanceof CalendarSyncUncertain;
    return { ...base, status: uncertain ? "incerto" : "falhou", code: uncertain ? "resultado_incerto" : "erro_google",
      error: uncertain ? error.message : "Não foi possível enviar ao Google; a reserva no sistema continua valendo." };
  }
}

/** Visitas ativas do protocolo, em ordem cronológica (mesma lista para enviar, numerar e atualizar). */
async function activeVisits(protocolId: number, empresaId: number): Promise<SessionRow[]> {
  const all = await db.select().from(sessionsTable).where(eq(sessionsTable.protocolId, protocolId))
    .orderBy(asc(sessionsTable.scheduledDate), asc(sessionsTable.scheduledTime), asc(sessionsTable.id));
  return all.filter(s => !s.agendaArchived && s.status !== "cancelled" &&
    (s.empresaId === null || s.empresaId === empresaId));
}

/**
 * Depois de remarcar uma visita que já está no Google: atualiza o MESMO evento (mesmo identificador),
 * com a descrição completa e o novo dia/horário. Devolve null quando não há nada a atualizar.
 * Quem chama já autorizou a sessão; aqui não há profissional logado para conferir vínculo.
 */
export async function refreshSessionEventInPlace(sessionId: number, empresaId: number): Promise<VisitSyncResult | null> {
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!session || session.agendaArchived || session.status === "cancelled" || session.empresaId !== empresaId ||
      (!session.googleEventId && !session.googleSyncPendingOperation)) return null;
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, session.clientId));
  if (!client || client.empresaId !== empresaId) return null;
  const visits = await activeVisits(session.protocolId, empresaId);
  const index = visits.findIndex(v => v.id === session.id);
  if (index < 0) return null;
  // Mesma exigência do envio manual: dados clínicos só vão à conta Google da clínica.
  if (!(await accountConfirmed())) {
    return { sessionId: session.id, date: session.scheduledDate, time: session.scheduledTime, status: "falhou",
      code: "google_indisponivel", error: "a conta Google da clínica não foi confirmada; nenhum evento foi alterado" };
  }
  return syncVisit(session, { empresaId, professionalId: null, client, position: index + 1, total: visits.length });
}

async function accountConfirmed(): Promise<boolean> {
  try { return (await verifyClinicAccount()).ok; } catch { return false; }
}

/** Aviso para a tela quando o Google não acompanhou a remarcação; nunca lança e nunca desfaz a remarcação. */
export async function refreshAfterReschedule(sessionId: number, empresaId: number): Promise<string | undefined> {
  try {
    const result = await refreshSessionEventInPlace(sessionId, empresaId);
    if (!result || result.status === "sincronizado") return undefined;
    return `Remarcação salva, mas o evento no Google Agenda não foi atualizado (${result.error ?? "sem detalhe"}). Use "Enviar ao Google Agenda" no protocolo para tentar de novo.`;
  } catch {
    return 'Remarcação salva, mas o evento no Google Agenda não foi atualizado. Use "Enviar ao Google Agenda" no protocolo para tentar de novo.';
  }
}

const isGone = (error: any) => [404, 410].includes(error?.code) || [404, 410].includes(error?.status) ||
  [404, 410].includes(error?.response?.status);

/**
 * Visita cancelada: remove o evento do Google. Evento que já não existe (404/410) conta como removido.
 * Se o Google falhar, o ponteiro do evento é MANTIDO (nunca se perde o rastro de um evento que continua lá)
 * e a tela recebe o aviso. O cancelamento no sistema vale de qualquer forma.
 */
export async function removeSessionEvent(sessionId: number, empresaId: number): Promise<{ removed: boolean; warning?: string }> {
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!session || session.empresaId !== empresaId || !session.googleEventId) return { removed: false };
  // Conta errada vê 404 num calendário que não enxerga: sem confirmar a conta, "404" não prova remoção.
  if (!(await accountConfirmed())) {
    return { removed: false,
      warning: "Visita cancelada no sistema, mas a conta Google da clínica não foi confirmada e o evento continua na agenda. Apague-o manualmente ou repita o cancelamento depois." };
  }
  try {
    await deleteCalendarEvent(session.googleEventId, session.googleCalendarId || undefined);
  } catch (error) {
    if (!isGone(error)) {
      return { removed: false,
        warning: "Visita cancelada no sistema, mas o evento no Google Agenda não pôde ser removido e continua lá. Apague-o manualmente na agenda." };
    }
  }
  await db.update(sessionsTable).set({ googleEventId: null, googleCalendarId: null })
    .where(and(eq(sessionsTable.id, sessionId), eq(sessionsTable.googleEventId, session.googleEventId)));
  return { removed: true };
}

/**
 * Envia (ou atualiza) no Google Agenda os eventos das visitas reservadas de um protocolo. Visita a visita,
 * em ordem de data; falha de uma não impede as outras e nenhuma falha desfaz a reserva no sistema.
 */
export async function syncProtocolSessionsToGoogle(params: ProtocolGoogleSyncParams): Promise<ProtocolGoogleSyncResult> {
  const [protocol] = await db.select({ id: protocolsTable.id, clientId: protocolsTable.clientId, empresaId: protocolsTable.empresaId })
    .from(protocolsTable).where(eq(protocolsTable.id, params.protocolId));
  if (!protocol || protocol.clientId !== params.clientId || protocol.empresaId !== params.empresaId) {
    return { ok: false, status: 404, code: "protocolo_nao_encontrado", error: "Protocolo não encontrado" };
  }
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, params.clientId));
  if (!client || client.empresaId !== params.empresaId) {
    return { ok: false, status: 404, code: "cliente_nao_encontrado", error: "Cliente não encontrado" };
  }
  const sessions = await activeVisits(protocol.id, params.empresaId);
  if (sessions.length === 0) {
    return { ok: false, status: 409, code: "sem_visitas", error: "O protocolo não tem visitas agendadas para enviar ao Google." };
  }

  const visits: VisitSyncResult[] = [];
  const base = (s: SessionRow) => ({ sessionId: s.id, date: s.scheduledDate, time: s.scheduledTime });
  const todo = sessions.filter(s => params.refresh || !s.googleEventId || s.googleSyncPendingOperation);
  const skipped = new Set(sessions.filter(s => !todo.includes(s)).map(s => s.id));
  const batch = new Set(todo.slice(0, MAX_VISITS_PER_GOOGLE_SYNC).map(s => s.id));

  if (batch.size > 0 && !(await verifyClinicAccount()).ok) {
    return { ok: false, status: 503, code: "google_indisponivel",
      error: "Não foi possível confirmar a conta Google autorizada. Nenhum evento foi alterado; as visitas continuam reservadas no sistema." };
  }

  let stopped = false;
  for (const listed of sessions) {
    if (skipped.has(listed.id)) { visits.push({ ...base(listed), status: "ja_sincronizado", eventId: listed.googleEventId ?? undefined }); continue; }
    if (!batch.has(listed.id) || stopped) {
      visits.push({ ...base(listed), status: "nao_processada" });
      continue;
    }
    if (params.stillAuthorized && !(await params.stillAuthorized())) {
      stopped = true;
      visits.push({ ...base(listed), status: "nao_processada", code: "acesso_alterado",
        error: "O acesso mudou durante o envio; o restante não foi enviado." });
      continue;
    }
    // Relê a sessão no momento de enviar: a lista inicial pode estar velha.
    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, listed.id));
    if (!session || session.agendaArchived || session.status === "cancelled") {
      visits.push({ ...base(listed), status: "falhou", code: "visita_mudou", error: "A visita mudou durante o envio; nada foi enviado." });
      continue;
    }
    const position = sessions.findIndex(s => s.id === session.id) + 1;
    visits.push(await syncVisit(session, {
      empresaId: params.empresaId, professionalId: params.professionalId, client,
      position: position > 0 ? position : sessions.length, total: sessions.length,
    }));
  }
  const count = (status: VisitSyncStatus) => visits.filter(v => v.status === status).length;
  return {
    ok: true, visits, synced: count("sincronizado"), alreadySynced: count("ja_sincronizado"),
    failed: count("falhou") + count("incerto"), remaining: count("nao_processada"),
  };
}
