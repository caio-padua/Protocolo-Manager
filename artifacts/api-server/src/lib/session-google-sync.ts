import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import {
  agendaResourcesTable, clientsTable, db, locationProfessionalsTable, locationsTable, protocolsTable,
  sessionsTable, substanceApplicationsTable, substancesTable,
} from "@workspace/db";
import { estadoAplicacao } from "./estado-aplicacao-protocolo";
import { carregarItensDoProtocolo, resumirSubstanciasDaVisita, type ItemDoProtocolo } from "./substancias-constantes";
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
export interface ReservedSyncOptions {
  /**
   * Só vale para evento que JÁ existe no Google. Falha ao atualizá-lo libera a reserva (comparando com a operação
   * própria) em vez de deixá-la presa: repetir events.update com o mesmo identificador é seguro, e a reserva presa
   * bloquearia o próximo registro clínico da mesma visita. Sem esta opção (remarcação, envio manual) a reserva fica.
   */
  releaseOnUpdateFailure?: boolean;
  /**
   * Prazo máximo da chamada events.update quando releaseOnUpdateFailure está ligado. Sem prazo, uma chamada que nunca
   * responde deixaria a reserva presa para sempre. A chamada HTTP também recebe esse limite (é abortada no cliente);
   * como a atualização reescreve o evento inteiro a partir do banco, repetir depois é seguro.
   */
  updateDeadlineMs?: number;
  /**
   * K7: itens do protocolo usados para listar as substâncias constantes. Conferidos de novo depois da reserva, como a
   * sessão e as aplicações: se o protocolo mudou no intervalo, nada é enviado.
   */
  expectedProtocolItems?: ItemDoProtocolo[];
}

/** Prazo da atualização de evento existente disparada por ação clínica (menor que o limite de resposta da tela). */
export const EVENT_UPDATE_DEADLINE_MS = 7000;

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_ok, reject) => {
    timer = setTimeout(() => reject(new Error("O Google não respondeu no prazo.")), ms);
  });
  work.catch(() => undefined); // se o prazo vencer, a falha tardia não pode virar rejeição sem tratamento
  return Promise.race([work, limit]).finally(() => { if (timer) clearTimeout(timer); });
}

export async function syncReservedEvent(
  session: typeof sessionsTable.$inferSelect,
  data: CalendarEventData,
  expectedApplications: (typeof substanceApplicationsTable.$inferSelect)[],
  options: ReservedSyncOptions = {},
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
  const releaseOwnReservation = () => db.update(sessionsTable).set({
    googleSyncPendingOperation: null, googleSyncPendingEventId: null, googleSyncPendingCalendarId: null,
  }).where(and(eq(sessionsTable.id, session.id), eq(sessionsTable.googleSyncPendingOperation, operation)));
  let drifted: boolean;
  try {
    const [fresh] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, session.id));
    const freshApplications = await db.select().from(substanceApplicationsTable)
      .where(eq(substanceApplicationsTable.sessionId, session.id));
    const itemsChanged = options.expectedProtocolItems !== undefined &&
      JSON.stringify(await carregarItensDoProtocolo(session.protocolId, session.empresaId)) !== JSON.stringify(options.expectedProtocolItems);
    drifted = !fresh || stripReservation(fresh) !== stripReservation(session) ||
      serializeApplications(freshApplications) !== serializeApplications(expectedApplications) || itemsChanged;
  } catch (error) {
    // Falha de leitura DEPOIS da reserva e ANTES de qualquer envio: nada foi ao Google, então a reserva própria é devolvida.
    try { await releaseOwnReservation(); } catch { /* banco indisponível: a reserva fica e exigirá conferência */ }
    throw error;
  }
  if (drifted) {
    await releaseOwnReservation();
    throw new CalendarSyncUncertain("A sessão mudou antes do envio. Nenhum evento foi alterado; confira e tente novamente.");
  }
  try {
    if (session.googleEventId) {
      if (options.releaseOnUpdateFailure) {
        const deadline = options.updateDeadlineMs ?? EVENT_UPDATE_DEADLINE_MS;
        await withDeadline(updateCalendarEvent(eventId, calendarId, data, { timeoutMs: deadline }), deadline);
      } else {
        await updateCalendarEvent(eventId, calendarId, data);
      }
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
    if (options.releaseOnUpdateFailure && session.googleEventId) {
      // Atualização de evento existente é idempotente: libera SÓ a reserva própria e devolve falha comum (não incerta).
      try {
        await db.update(sessionsTable).set({
          googleSyncPendingOperation: null, googleSyncPendingEventId: null, googleSyncPendingCalendarId: null,
        }).where(and(eq(sessionsTable.id, session.id), eq(sessionsTable.googleSyncPendingOperation, operation)));
      } catch { /* banco indisponível: a reserva fica e exigirá conferência, como no fluxo padrão */ }
      throw new Error("Não foi possível atualizar o evento existente no Google.");
    }
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
  expectedProtocolItems?: ItemDoProtocolo[],
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

  const restorePreviousReservation = () => db.update(sessionsTable).set({ googleSyncPendingOperation: previousOperation })
    .where(and(eq(sessionsTable.id, session.id), eq(sessionsTable.googleSyncPendingOperation, operation)));
  let drifted: boolean;
  try {
    const [fresh] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, session.id));
    const freshApplications = await db.select().from(substanceApplicationsTable)
      .where(eq(substanceApplicationsTable.sessionId, session.id));
    const itemsChanged = expectedProtocolItems !== undefined &&
      JSON.stringify(await carregarItensDoProtocolo(session.protocolId, session.empresaId)) !== JSON.stringify(expectedProtocolItems);
    drifted = !fresh || sessionFingerprint(fresh) !== sessionFingerprint(session) ||
      applicationsFingerprint(freshApplications) !== applicationsFingerprint(expectedApplications) || itemsChanged;
  } catch (error) {
    // Nada foi enviado nesta tentativa: devolve a reserva anterior (que continua incerta) mesmo se a leitura falhou.
    try { await restorePreviousReservation(); } catch { /* banco indisponível: a conferência manual continua possível */ }
    throw error;
  }
  if (drifted) {
    // Nada foi enviado nesta tentativa: devolve a reserva anterior, que continua incerta.
    await restorePreviousReservation();
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
    if (!destination.ok) {
      return { code: destination.code,
        message: `O agendamento ficará salvo no sistema, mas o envio ao Google Agenda não vai funcionar: ${destination.error} Corrija o cadastro antes ou envie depois.` };
    }

    const account = await verifyClinicAccount();
    if (!account.ok) {
      const accountMismatch = account.account !== null;
      return {
        code: accountMismatch ? "conta_google_divergente" : "google_indisponivel",
        message: accountMismatch
          ? "O agendamento ficará salvo no sistema, mas a conta Google conectada não é a conta autorizada da clínica. Corrija a conexão antes de enviar."
          : "O agendamento ficará salvo no sistema, mas não foi possível confirmar a conta Google autorizada da clínica. Verifique a conexão antes de enviar.",
      };
    }
    return null;
  } catch {
    return { code: "verificacao_indisponivel",
      message: "Não foi possível verificar se o envio ao Google Agenda está pronto. O agendamento ficará salvo no sistema." };
  }
}

/**
 * K7: substâncias do protocolo sem linha na visita, prontas para o evento do Google, e os números "X de Y".
 * Usada pelo envio por protocolo E pelas rotas de envio por sessão/semana: o evento nunca depende do caminho.
 * Constante = estado INDI, posição 0 ("–/total"), nunca devida, sem via; substância sem cadastro vira texto explícito.
 */
export async function montarConstantesDoEvento(
  applications: { substanceId: number; availability: string }[], protocolItems: ItemDoProtocolo[],
): Promise<{ constants: CalendarSubstance[]; counts: Pick<CalendarEventData, "visitSubstanceCount" | "protocolSubstanceCount"> }> {
  const summary = resumirSubstanciasDaVisita(applications, protocolItems);
  if (!summary) return { constants: [], counts: {} };
  const constants: CalendarSubstance[] = [];
  for (const item of summary.constants) {
    const [substance] = await db.select().from(substancesTable).where(eq(substancesTable.id, item.substanceId));
    constants.push({
      name: substance?.name ?? `Substância não cadastrada (${item.substanceId})`, dose: item.dose, sessionNumber: 0,
      totalSessions: item.totalSessions, status: "unavailable",
    });
  }
  return { constants, counts: { visitSubstanceCount: summary.visitCount, protocolSubstanceCount: summary.protocolCount } };
}

/** Evento de uma visita: todas as aplicações da sessão viram a lista de substâncias da descrição. */
async function buildVisitEvent(
  session: SessionRow, client: typeof clientsTable.$inferSelect, destination: Extract<Destination, { ok: true }>,
  applications: ApplicationRow[], position: number, totalVisits: number, protocolItems: ItemDoProtocolo[] = [],
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
  // K7: as demais substâncias do protocolo ficam constantes (informativas; nunca devidas, sem via, sem bloqueio).
  const extra = await montarConstantesDoEvento(applications, protocolItems);
  substances.push(...extra.constants);
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
      ...extra.counts,
      // Só para a descrição: o envio nunca cria participante nem convite (sendUpdates "none").
      clientEmail: client.email || undefined,
      sessionStatus: session.status, rescheduleCount: session.rescheduleCount,
    },
  };
}

interface VisitContext {
  empresaId: number; professionalId: number | null; client: typeof clientsTable.$inferSelect;
  position: number; total: number;
  /** Ver ReservedSyncOptions.releaseOnUpdateFailure. */
  releaseOnUpdateFailure?: boolean;
  updateDeadlineMs?: number;
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
  let protocolItems: ItemDoProtocolo[];
  try {
    protocolItems = await carregarItensDoProtocolo(session.protocolId, ctx.empresaId);
  } catch {
    // Falha explícita desta visita (o lote segue): não se envia evento com a composição do protocolo desconhecida.
    return { ...base, status: "falhou", code: "itens_protocolo_indisponiveis",
      error: "Não foi possível ler as substâncias do protocolo; nenhum evento foi enviado." };
  }
  const built = await buildVisitEvent(session, ctx.client, destination, applications, ctx.position, ctx.total, protocolItems);
  if (!built.ok) return { ...base, status: "falhou", code: built.code, error: built.error };
  try {
    const eventId = session.googleSyncPendingOperation
      ? await reconcilePendingEvent(session, built.data, applications, protocolItems)
      : await syncReservedEvent(session, built.data, applications, {
        releaseOnUpdateFailure: ctx.releaseOnUpdateFailure, updateDeadlineMs: ctx.updateDeadlineMs,
        expectedProtocolItems: protocolItems,
      });
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
export async function refreshSessionEventInPlace(
  sessionId: number, empresaId: number, options: { releaseUpdateFailure?: boolean; updateDeadlineMs?: number } = {},
): Promise<VisitSyncResult | null> {
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId));
  if (!session || session.agendaArchived || session.status === "cancelled" || session.empresaId !== empresaId ||
      (!session.googleEventId && !session.googleSyncPendingOperation)) return null;
  if (options.releaseUpdateFailure && session.googleSyncPendingOperation) {
    // Ação clínica nunca reivindica a reserva de outra operação (envio manual, criação ou remarcação em andamento):
    // reconciliar aqui escreveria no Google enquanto o dono da reserva ainda pode estar escrevendo.
    return { sessionId: session.id, date: session.scheduledDate, time: session.scheduledTime, status: "falhou",
      code: "sincronizacao_em_andamento",
      error: "Há outra sincronização com o Google em andamento nesta visita." };
  }
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
  return syncVisit(session, {
    empresaId, professionalId: null, client, position: index + 1, total: visits.length,
    releaseOnUpdateFailure: options.releaseUpdateFailure, updateDeadlineMs: options.updateDeadlineMs,
  });
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

/** Espera máxima por uma atualização de evento já em andamento antes de recusar o próximo registro da visita. */
export const EVENT_UPDATE_SETTLE_MS = 3000;

/**
 * Registrar duas substâncias da mesma visita em seguida é o fluxo normal: a atualização do Google disparada pelo
 * primeiro registro mantém a reserva por 1 a 2 s. Em vez de recusar o segundo registro (409), espera um pouco que
 * a reserva de uma ATUALIZAÇÃO (evento já existe) termine. Reserva de primeiro envio (criação) ou que dure mais que
 * o limite continua sendo recusada pela regra de sempre; aqui nada é decidido, só se espera.
 */
export async function waitForEventUpdateToSettle(
  sessionId: number, empresaId: number, maxMs: number = EVENT_UPDATE_SETTLE_MS,
): Promise<void> {
  const deadline = Date.now() + maxMs;
  for (;;) {
    const [row] = await db.select({
      pendingOperation: sessionsTable.googleSyncPendingOperation,
      pendingEventId: sessionsTable.googleSyncPendingEventId,
      eventId: sessionsTable.googleEventId,
    }).from(sessionsTable).where(and(eq(sessionsTable.id, sessionId), eq(sessionsTable.empresaId, empresaId)));
    const updating = !!row?.pendingOperation && !!row.eventId && row.pendingEventId === row.eventId;
    if (!updating || Date.now() >= deadline) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/** Limite de espera do registro de aplicação: o Google nunca pode segurar a resposta ao profissional. */
export const APPLICATION_REFRESH_TIMEOUT_MS = 8000;

/**
 * Depois de registrar uma ação clínica na visita (aplicada, não realizada, concluída, faltou): atualiza o MESMO
 * evento no Google. Devolve o aviso para a tela; nunca lança e nunca desfaz o registro clínico. Visita que nunca foi
 * ao Google não chama o Google. Falha ao atualizar evento existente não deixa reserva presa (ver ReservedSyncOptions).
 */
export async function refreshAfterApplication(
  sessionId: number, empresaId: number,
  options: { what?: string; timeoutMs?: number; updateDeadlineMs?: number } = {},
): Promise<string | undefined> {
  const what = options.what ?? "Aplicação registrada";
  const retry = 'A atualização será refeita na próxima ação ou pelo botão "Enviar ao Google Agenda" no protocolo.';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<"timeout">(resolve => {
      timer = setTimeout(() => resolve("timeout"), options.timeoutMs ?? APPLICATION_REFRESH_TIMEOUT_MS);
    });
    const work = refreshSessionEventInPlace(sessionId, empresaId, {
      releaseUpdateFailure: true, updateDeadlineMs: options.updateDeadlineMs,
    });
    work.catch(() => undefined); // se o tempo esgotar, a falha tardia não pode virar rejeição sem tratamento
    const result = await Promise.race([work, timeout]);
    if (result === "timeout") return `${what}, mas o Google Agenda demorou para responder e o evento pode estar desatualizado. ${retry}`;
    if (!result || result.status === "sincronizado") return undefined;
    const reason = result.code === "google_indisponivel"
      ? "a conta Google da clínica não foi confirmada"
      : result.code === "sincronizacao_em_andamento"
        ? "há outra sincronização com o Google em andamento"
        : "o Google não confirmou a atualização";
    return `${what}, mas o evento no Google Agenda não foi atualizado (${reason}). ${retry}`;
  } catch {
    return `${what}, mas o evento no Google Agenda não foi atualizado. ${retry}`;
  } finally {
    if (timer) clearTimeout(timer);
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
