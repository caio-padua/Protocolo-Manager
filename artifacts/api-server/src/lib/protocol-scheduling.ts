import { createHash } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  agendaResourcesTable, clientsTable, db, locationsTable, protocolItemsTable, protocolsTable,
  sessionsTable, substancesTable,
} from "@workspace/db";
import { brtISODate } from "./brt";
import { getVisitPreferences } from "./client-visit-preferences";
import { ClientProtocolAgendaError, loadClientProtocolAgendas } from "./protocol-client-agendas";
import {
  buildExactProtocolSchedule, planProtocolWithAvailableSlots,
  type AvailableProtocolSlot, type ExactScheduleItem,
} from "./protocol-exact-schedule";
import { loadProtocolSlots, MAX_SLOT_SOURCE_DAYS, type ProtocolSlotDiagnostics } from "./protocol-slot-source";
import {
  classifySlotSourceError, protocolPlanSnapshot, reserveProtocolVisits, type ReservationErrorCode,
  type ReservedVisit,
} from "./protocol-visit-reservation";
import { NURSING_PERIOD_MINUTES } from "./protocol-visit-sizing";
import { durationSecondsFromMinutes, substanceDurationMinutes } from "./substance-duration";

/**
 * Agendamento de protocolo com prévia (etapa 4 de 7; ver
 * specs/regras-agendamento-consultas-procedimentos.md, item 8).
 *
 * Une as peças já provadas: lê as vagas do motor de agenda, roda o planejador
 * NO SERVIDOR e só então reserva (reserveProtocolVisits). O navegador nunca
 * entrega o plano: ele só devolve a "impressão digital" da prévia que viu, e a
 * confirmação recalcula tudo. Se a agenda mudou entre a prévia e a confirmação,
 * a impressão digital não bate e nada é gravado ("plano_mudou", com a prévia nova).
 *
 * Só enfermagem local. Visita que exija o médico é recusada de forma explícita,
 * porque ainda não existe fonte de ocupação do médico e ela não será inventada.
 */

/** Margem de 4 dias para mais ou para menos; intervalo mínimo = frequência - 4 dias (regra do médico). */
export const TOLERANCE_DAYS = 4;
export const MIN_INTERVAL_REDUCTION_DAYS = 4;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FINGERPRINT = /^[0-9a-f]{32}$/;
const DAY_MS = 86_400_000;

export type SchedulingErrorCode =
  | ReservationErrorCode
  | "pedido_invalido" | "agenda_enfermagem_indefinida" | "agenda_nao_autorizada" | "periodo_longo_demais" | "datas_no_passado"
  | "protocolo_grande_demais" | "sem_plano" | "busca_limitada" | "plano_mudou" | "confirmacao_ausente"
  | "acesso_alterado";

export interface PlannedApplicationView {
  substanceId: number;
  substanceName: string;
  dose: string;
  sessionNumber: number;
  totalSessions: number;
  nominalDate: string;
  /** Dias de diferença entre a data planejada e a data nominal do protocolo (negativo = antes). */
  shiftDays: number;
}

export interface PlannedVisitView {
  date: string;
  time: string;
  /** 0 = domingo ... 6 = sábado. */
  weekday: number;
  nursingPeriods: number;
  reservedMinutes: number;
  applications: PlannedApplicationView[];
}

export interface SchedulingPreview {
  protocolId: number;
  nursingResourceId: number;
  nursingResourceName: string;
  nursingLocationId: number;
  nursingLocationName: string;
  visits: PlannedVisitView[];
  visitCount: number;
  firstDate: string;
  lastDate: string;
  /** Mais de uma visita na mesma semana: precisa de confirmação de rotina por quem decide. */
  requiresRoutineConfirmation: boolean;
  /** A busca foi limitada: pode existir plano melhor que o apresentado. */
  searchWasPruned: boolean;
  /** Alguma vaga escolhida coincide com dia/horário preferencial cadastrado do cliente. */
  matchesClientPreference: boolean;
  fingerprint: string;
  /** Fotografia dos dados clínicos do protocolo; a reserva a confere de novo sob o bloqueio. */
  snapshot: string;
  diagnostics: ProtocolSlotDiagnostics;
}

export type SchedulingRefusal = {
  ok: false;
  status: 400 | 403 | 404 | 409 | 422;
  code: SchedulingErrorCode;
  error: string;
  date?: string;
  time?: string;
  diagnostics?: ProtocolSlotDiagnostics;
  /** Só em "plano_mudou": a prévia recalculada agora. */
  preview?: SchedulingPreview;
};

export type SchedulingPreviewResult = { ok: true; preview: SchedulingPreview } | SchedulingRefusal;

export type SchedulingConfirmResult =
  | { ok: true; preview: SchedulingPreview; protocolStatus: "validated"; reserved: ReservedVisit[] }
  | SchedulingRefusal;

const refusal = (
  status: SchedulingRefusal["status"], code: SchedulingErrorCode, error: string,
  extra: Partial<Pick<SchedulingRefusal, "date" | "time" | "diagnostics" | "preview">> = {},
): SchedulingRefusal => ({ ok: false, status, code, error, ...extra });

const isPositiveInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const dayNumber = (date: string) => Math.round(Date.parse(`${date}T12:00:00Z`) / DAY_MS);
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const brDate = (date: string) => date.split("-").reverse().join("/");

/** Texto com os motivos pelos quais dias lidos não ofereceram horário (cada causa separada das outras). */
function describeAgendaGaps(d: ProtocolSlotDiagnostics): string {
  const list = (dates: string[]) => {
    const shown = dates.slice(0, 6).map(brDate).join(", ");
    return dates.length > 6 ? `${shown} e mais ${dates.length - 6}` : shown;
  };
  const parts: string[] = [];
  if (d.nursingDatesWithException.length) {
    parts.push(`${d.nursingDatesWithException.length} com exceção cadastrada (${list(d.nursingDatesWithException)})`);
  }
  if (d.nursingDatesWithoutSchedule.length) {
    parts.push(`${d.nursingDatesWithoutSchedule.length} sem expediente da enfermagem`);
  }
  if (d.integrationPendingDates.length) {
    parts.push(`${d.integrationPendingDates.length} com a agenda do Google desatualizada (${list(d.integrationPendingDates)})`);
  }
  if (d.nursingDatesWithoutOpenSlot.length) {
    parts.push(`${d.nursingDatesWithoutOpenSlot.length} com expediente, mas sem horário livre (ocupado, bloqueado ou dentro da antecedência mínima)`);
  }
  return parts.join("; ");
}

type NursingPreferences = Awaited<ReturnType<typeof getVisitPreferences>>["preferences"]["nursing"];

/**
 * Posição de uma vaga na preferência do cliente (1 = mais desejada); ausente = sem preferência.
 * Ordem explícita primeiro, depois dia e horário escolhidos, depois só o dia escolhido.
 * Preferência ordena as vagas, mas NUNCA as exclui: ela não é restrição nem liberação.
 */
export function preferenceRankFor(preferences: NursingPreferences, date: string, time: string): number | undefined {
  const weekday = weekdayOf(date);
  const priority = preferences.priority ?? [];
  const exact = priority.findIndex(entry => entry.weekday === weekday && entry.time === time);
  if (exact >= 0) return exact + 1;
  if (preferences.times.some(entry => entry.weekday === weekday && entry.time === time)) return priority.length + 1;
  if (preferences.weekdays.includes(weekday)) return priority.length + 2;
  return undefined;
}

export interface PlanProtocolSchedulingParams {
  empresaId: number;
  clientId: number;
  protocolId: number;
  /** Opcional: sem ela vale a agenda de enfermagem padrão do cliente, depois a preferencial. */
  nursingResourceId?: number | null;
}

/** Calcula a prévia no servidor. Não grava nada. */
export async function planProtocolScheduling(params: PlanProtocolSchedulingParams): Promise<SchedulingPreviewResult> {
  const { empresaId, clientId, protocolId } = params;
  if (![empresaId, clientId, protocolId].every(isPositiveInt) ||
      (params.nursingResourceId != null && !isPositiveInt(params.nursingResourceId))) {
    return refusal(400, "pedido_invalido", "Identificadores inválidos");
  }

  let clientAgendas;
  try {
    clientAgendas = await loadClientProtocolAgendas(clientId, empresaId, { requireMedical: false });
  } catch (error) {
    if (error instanceof ClientProtocolAgendaError) {
      const code: SchedulingErrorCode =
        error.code === "cliente_nao_encontrado" || error.code === "agenda_enfermagem_indefinida" ||
        error.code === "agenda_invalida"
          ? error.code
          : "agenda_nao_autorizada";
      return refusal(error.status, code, error.message);
    }
    throw error;
  }
  const client = clientAgendas.client;

  const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, protocolId));
  if (!protocol || protocol.clientId !== clientId || protocol.empresaId !== empresaId) {
    return refusal(404, "protocolo_nao_encontrado", "Protocolo não pertence ao cliente");
  }
  const anySession = await db.select({ id: sessionsTable.id }).from(sessionsTable)
    .where(eq(sessionsTable.protocolId, protocol.id)).limit(1);
  if (anySession.length > 0) {
    return refusal(409, "protocolo_ja_agendado",
      "Protocolo já tem sessões; confira o histórico sem recriar os agendamentos");
  }
  if (protocol.status !== "suggested" && protocol.status !== "validated") {
    return refusal(409, "protocolo_status_invalido",
      "O protocolo precisa estar sugerido ou validado sem sessões para ser agendado");
  }

  // Itens e catálogo: dose, total, intervalo e duração vêm do banco, nunca do navegador.
  const items = await db.select().from(protocolItemsTable).where(eq(protocolItemsTable.protocolId, protocol.id))
    .orderBy(asc(protocolItemsTable.id));
  if (items.length === 0 || new Set(items.map(i => i.substanceId)).size !== items.length ||
      items.some(i => !isPositiveInt(i.totalSessions) || !isPositiveInt(i.intervalDays) ||
        !validDate(i.startDate) || typeof i.dose !== "string" || !i.dose.trim())) {
    return refusal(422, "protocolo_incompleto",
      "Confira as substâncias, as quantidades de sessões, os intervalos e as datas antes de agendar");
  }
  const substances = await db.select().from(substancesTable)
    .where(inArray(substancesTable.id, items.map(i => i.substanceId)));
  const substanceById = new Map(substances.map(s => [s.id, s]));
  const exactItems: ExactScheduleItem[] = [];
  let anyDoctor = false;
  for (const item of items) {
    const substance = substanceById.get(item.substanceId);
    if (!substance) return refusal(422, "protocolo_incompleto", `Substância ${item.substanceId} não encontrada no catálogo`);
    if (substance.doctorParticipation == null) {
      return refusal(422, "participacao_medica_indefinida",
        `Participação médica não definida para a substância ${substance.name}`);
    }
    let durationSeconds: number;
    try {
      durationSeconds = durationSecondsFromMinutes(substanceDurationMinutes(substance));
    } catch {
      return refusal(422, "substancia_sem_duracao", `Duração não definida para a substância ${substance.name}`);
    }
    if (substance.doctorParticipation) anyDoctor = true;
    exactItems.push({
      substanceId: item.substanceId, dose: item.dose, totalSessions: item.totalSessions,
      intervalDays: item.intervalDays, startDate: item.startDate, durationSeconds,
      requiresDoctor: substance.doctorParticipation,
    });
  }
  if (anyDoctor) {
    return refusal(422, "medico_nao_habilitado",
      "Este protocolo tem substância que exige o médico, e ainda não há agenda médica com expediente para reservar. " +
      "Nada foi agendado.");
  }

  // A agenda escolhida precisa estar explicitamente vinculada ao cadastro deste cliente.
  const nursingResourceId = params.nursingResourceId ?? clientAgendas.nursingAgenda.id;
  const selectedAgenda = clientAgendas.resources.find(resource => resource.id === nursingResourceId);
  if (!selectedAgenda) {
    return refusal(404, "agenda_nao_encontrada",
      "A agenda de enfermagem não está vinculada ao cadastro deste cliente. Nada foi agendado.");
  }
  if (selectedAgenda.kind !== "enfermagem" || selectedAgenda.modality !== "local") {
    return refusal(422, "agenda_invalida",
      "O agendamento por períodos só está habilitado para uma agenda de enfermagem local.");
  }
  const [resource] = await db.select({
    id: agendaResourcesTable.id, name: agendaResourcesTable.name, kind: agendaResourcesTable.kind,
    modality: agendaResourcesTable.modality, active: agendaResourcesTable.active,
    locationId: locationsTable.id, locationName: locationsTable.name,
  }).from(agendaResourcesTable)
    .innerJoin(locationsTable, eq(locationsTable.id, agendaResourcesTable.locationId))
    .where(and(eq(agendaResourcesTable.id, nursingResourceId), eq(locationsTable.empresaId, empresaId),
      eq(locationsTable.active, "true")));
  if (!resource || !resource.active) return refusal(404, "agenda_nao_encontrada", "Agenda não encontrada ou inativa");
  if (resource.kind !== "enfermagem") return refusal(422, "agenda_invalida", "A agenda informada não é de enfermagem");
  if (resource.modality !== "local") {
    return refusal(422, "agenda_invalida",
      "O agendamento por períodos só está habilitado para a agenda de enfermagem local");
  }

  // Janela de leitura: só o que o protocolo precisa (leitura do motor custa processamento).
  let nominal;
  try {
    nominal = buildExactProtocolSchedule(protocol.startDate, exactItems);
  } catch {
    return refusal(422, "protocolo_incompleto", "Confira as datas e os intervalos das substâncias antes de agendar");
  }
  const today = brtISODate();
  const firstStart = exactItems.map(i => i.startDate as string).sort()[0];
  const fromDate = firstStart > today ? firstStart : today;
  const toDate = addDays(nominal[nominal.length - 1].date, TOLERANCE_DAYS);
  if (toDate < fromDate) {
    return refusal(409, "datas_no_passado",
      `Todas as datas do protocolo (até ${brDate(toDate)}) já passaram; ajuste a data de início antes de agendar`);
  }
  const daysToRead = dayNumber(toDate) - dayNumber(fromDate) + 1;
  if (daysToRead > MAX_SLOT_SOURCE_DAYS) {
    return refusal(422, "periodo_longo_demais",
      `O protocolo se estende por ${daysToRead} dias; o agendamento automático lê no máximo ${MAX_SLOT_SOURCE_DAYS} dias de agenda. ` +
      "Nada foi agendado.");
  }

  let source;
  try {
    source = await loadProtocolSlots({ empresaId, nursingResourceId, fromDate, toDate });
  } catch (error) {
    const known = classifySlotSourceError(error);
    if (known) return refusal(known.status, known.code, known.error);
    if (error instanceof Error && error.message.startsWith("Vagas demais")) {
      return refusal(422, "periodo_longo_demais", error.message);
    }
    throw error;
  }

  // Preferência do cliente ordena as vagas; não exclui nenhuma.
  const { preferences } = await getVisitPreferences(db, empresaId, clientId);
  const slots: AvailableProtocolSlot[] = source.slots.map(slot => {
    const rank = preferenceRankFor(preferences.nursing, slot.date, slot.time);
    return rank === undefined ? slot : { ...slot, preferenceRank: rank };
  });

  let plan;
  try {
    plan = planProtocolWithAvailableSlots(protocol.startDate, exactItems, slots, {
      toleranceDays: TOLERANCE_DAYS, minIntervalReductionDays: MIN_INTERVAL_REDUCTION_DAYS,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("excede o limite")) {
      return refusal(422, "protocolo_grande_demais",
        "O protocolo é grande demais para o planejamento automático; nada foi agendado");
    }
    throw error;
  }
  const { diagnostics } = source;
  if (!plan.ok) {
    if (plan.reason === "limite_busca_atingido") {
      return refusal(409, "busca_limitada",
        "A busca por horários atingiu o limite de cálculo sem achar um plano; nada foi agendado", { diagnostics });
    }
    const reasons = describeAgendaGaps(diagnostics);
    const common = "Não foi encontrada combinação de horários que respeite a margem de 4 dias e os intervalos mínimos do protocolo. " +
      (reasons ? `Nos dias lidos: ${reasons}. ` : "") +
      (firstStart < today ? "A data de início do protocolo já passou; ajuste-a se for o caso. " : "") +
      "Nada foi agendado.";
    if (diagnostics.integrationPendingDates.length > 0) {
      // Dia desconhecido nunca vira "sem vaga": o plano pode existir depois da atualização do Google.
      return refusal(409, "agenda_desatualizada",
        `${common} A agenda do Google está desatualizada em ${diagnostics.integrationPendingDates.length} dia(s); ` +
        "esses dias não foram tratados como ocupados. Tente de novo depois da atualização.", { diagnostics });
    }
    return refusal(409, "sem_plano", common, { diagnostics });
  }

  const nameById = new Map(substances.map(s => [s.id, s.name]));
  const visits: PlannedVisitView[] = plan.visits.map(visit => {
    const periods = visit.sizing?.nursingPeriods;
    if (!periods || visit.sizing?.requiresDoctor) throw new Error("Planejador devolveu visita sem dimensionamento de enfermagem");
    return {
      date: visit.date, time: visit.time, weekday: weekdayOf(visit.date),
      nursingPeriods: periods, reservedMinutes: periods * NURSING_PERIOD_MINUTES,
      applications: visit.applications.map(app => ({
        substanceId: app.substanceId, substanceName: nameById.get(app.substanceId) ?? `Substância ${app.substanceId}`,
        dose: app.dose, sessionNumber: app.sessionNumber, totalSessions: app.totalSessions,
        nominalDate: app.nominalDate, shiftDays: dayNumber(visit.date) - dayNumber(app.nominalDate),
      })),
    };
  });
  // A impressão digital cobre TUDO o que a prévia mostra e tudo o que define o plano (doses, totais,
  // intervalos, datas e durações via fotografia do protocolo, períodos e minutos reservados).
  const snapshot = protocolPlanSnapshot(protocol.startDate, items, substanceById);
  const fingerprint = createHash("sha256").update(JSON.stringify({
    snapshot, protocolId: protocol.id, nursingResourceId,
    nursingLocationId: resource.locationId, nursingLocationName: resource.locationName,
    visits: visits.map(v => [v.date, v.time, v.nursingPeriods, v.reservedMinutes,
      v.applications.map(a => [a.substanceId, a.dose, a.sessionNumber, a.totalSessions, a.nominalDate])]),
  })).digest("hex").slice(0, 32);

  return {
    ok: true,
    preview: {
      protocolId: protocol.id, nursingResourceId, nursingResourceName: resource.name,
      nursingLocationId: resource.locationId, nursingLocationName: resource.locationName,
      visits, visitCount: visits.length, firstDate: visits[0].date, lastDate: visits[visits.length - 1].date,
      requiresRoutineConfirmation: plan.requiresRoutineConfirmation, searchWasPruned: plan.searchWasPruned,
      matchesClientPreference: slots.some(slot => slot.preferenceRank !== undefined &&
        visits.some(v => v.date === slot.date && v.time === slot.time)),
      fingerprint, snapshot, diagnostics,
    },
  };
}

export interface ConfirmProtocolSchedulingParams extends PlanProtocolSchedulingParams {
  /** Impressão digital da prévia que o usuário viu; sem ela não há confirmação. */
  fingerprint: unknown;
  /**
   * Conferência final do acesso clínico, feita logo antes de reservar (o cálculo pode levar
   * vários segundos e a permissão do usuário pode ter mudado nesse intervalo).
   */
  stillAuthorized?: () => Promise<boolean>;
}

/** Recalcula o plano no servidor e reserva só se for idêntico ao que o usuário viu. */
export async function confirmProtocolScheduling(params: ConfirmProtocolSchedulingParams): Promise<SchedulingConfirmResult> {
  if (typeof params.fingerprint !== "string" || !FINGERPRINT.test(params.fingerprint)) {
    return refusal(400, "confirmacao_ausente", "Confirme a partir de uma prévia do agendamento");
  }
  const planned = await planProtocolScheduling(params);
  if (!planned.ok) return planned;
  const { preview } = planned;
  if (preview.fingerprint !== params.fingerprint) {
    return refusal(409, "plano_mudou",
      "A agenda mudou desde a prévia; confira a nova prévia antes de confirmar. Nada foi agendado.", { preview });
  }
  if (params.stillAuthorized && !(await params.stillAuthorized())) {
    return refusal(409, "acesso_alterado", "O acesso clínico mudou; recarregue e confira antes de agendar");
  }
  const reserved = await reserveProtocolVisits({
    empresaId: params.empresaId, clientId: params.clientId, protocolId: params.protocolId,
    nursingResourceId: preview.nursingResourceId, expectedSnapshot: preview.snapshot,
    expectedNursingLocationId: preview.nursingLocationId,
    visits: preview.visits.map(visit => ({
      date: visit.date, time: visit.time,
      applications: visit.applications.map(app => ({ substanceId: app.substanceId, sessionNumber: app.sessionNumber })),
    })),
  });
  if (!reserved.ok) {
    const { ok: _ok, ...rest } = reserved;
    return { ok: false, ...rest };
  }
  return { ok: true, preview, protocolStatus: reserved.protocolStatus, reserved: reserved.visits };
}
