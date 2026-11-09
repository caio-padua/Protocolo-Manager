import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  agendaResourcesTable, clientsTable, db, protocolItemsTable, protocolsTable,
  sessionsTable, substanceApplicationsTable, substancesTable,
} from "@workspace/db";
import { lockAgendaResource, SIM_TAG } from "./agenda-booking";
import { loadProtocolSlots } from "./protocol-slot-source";
import { NURSING_PERIOD_MINUTES, sizeVisit } from "./protocol-visit-sizing";
import { durationSecondsFromMinutes, substanceDurationMinutes } from "./substance-duration";

/**
 * Reserva atômica das visitas de um protocolo na agenda de enfermagem local
 * (etapa 3 de 7; ver specs/regras-agendamento-consultas-procedimentos.md, item 7).
 *
 * Grava tudo ou nada, numa única transação, sob o mesmo bloqueio por empresa
 * que a marcação avulsa usa. Dentro do bloqueio, relê do banco a empresa, o
 * cliente, o protocolo, as substâncias e os horários: nada que o chamador
 * informe (dose, total, duração, capacidade) é aceito como verdade.
 *
 * Não cria evento no Google, não reavalia intervalos nem tolerância (isso é do
 * planejador: o chamador deve entregar um plano calculado no servidor) e não
 * reserva visita que exija o médico, porque ainda não existe fonte de
 * ocupação do médico e ela não será inventada.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/**
 * Cada visita custa uma leitura do motor (73 a 130 ms) com o bloqueio da
 * empresa preso; o teto mantém esse bloqueio em poucos segundos.
 */
export const MAX_RESERVATION_VISITS = 80;
const MAX_APPLICATIONS_PER_VISIT = 60;
/** Mesmos estados que o motor de agenda trata como ocupação real. */
const LIVE_SESSION_STATUSES = ["scheduled", "confirmed", "completed"];

export type ReservationErrorCode =
  | "visitas_invalidas" | "agenda_nao_encontrada" | "agenda_invalida"
  | "cliente_nao_encontrado" | "protocolo_nao_encontrado" | "protocolo_ja_agendado"
  | "protocolo_status_invalido" | "protocolo_incompleto" | "plano_incoerente"
  | "substancia_sem_duracao" | "participacao_medica_indefinida" | "medico_nao_habilitado"
  | "agenda_desatualizada" | "dia_sem_expediente" | "dia_com_excecao"
  | "horario_indisponivel" | "cliente_ja_tem_visita_no_dia" | "plano_mudou";

export interface ReservationVisitInput {
  date: string;
  time: string;
  /** Só a identidade da aplicação; dose, total e duração vêm do banco. */
  applications: { substanceId: number; sessionNumber: number }[];
}

export interface ReserveProtocolVisitsParams {
  empresaId: number;
  clientId: number;
  protocolId: number;
  nursingResourceId: number;
  visits: ReservationVisitInput[];
  /** Marca as sessões com a etiqueta de simulação, como a marcação avulsa. */
  simulate?: boolean;
  /**
   * Fotografia (protocolPlanSnapshot) dos dados clínicos usados para calcular o plano. Sob o bloqueio a
   * reserva relê protocolo, itens e catálogo e recusa ("plano_mudou") se algo mudou desde o cálculo,
   * porque margem e intervalo mínimo dependem de doses, totais, intervalos, datas e durações.
   */
  expectedSnapshot?: string;
}

export interface ReservedVisit {
  sessionId: number;
  date: string;
  time: string;
  nursingPeriods: number;
  /** Tempo RESERVADO (períodos x 20 minutos), gravado em duration_minutes. */
  reservedMinutes: number;
  applications: { substanceId: number; sessionNumber: number }[];
}

export type ReserveProtocolVisitsResult =
  | { ok: true; protocolStatus: "validated"; visits: ReservedVisit[] }
  | { ok: false; status: 400 | 404 | 409 | 422; code: ReservationErrorCode; error: string;
      date?: string; time?: string };

type Refusal = Extract<ReserveProtocolVisitsResult, { ok: false }>;

/** Recusa lançada dentro da transação para desfazer qualquer gravação feita. */
class ReservationRefusal extends Error {
  constructor(readonly refusal: Refusal) {
    super(refusal.error);
  }
}

const refuse = (
  status: Refusal["status"], code: ReservationErrorCode, error: string,
  where?: { date?: string; time?: string },
): never => {
  throw new ReservationRefusal({ ok: false, status, code, error, ...where });
};

const brDate = (date: string) => date.split("-").reverse().join("/");

/**
 * Representação canônica dos dados clínicos que definem o plano de um protocolo (data de início, dose,
 * total, intervalo e data de cada item, duração e exigência de médico de cada substância).
 * Usada pelo planejador e pela reserva: se qualquer um destes dados mudar entre o cálculo e a gravação,
 * as duas pontas divergem e nada é gravado.
 */
export function protocolPlanSnapshot(
  protocolStartDate: string | null,
  items: { substanceId: number; dose: string; totalSessions: number; intervalDays: number; startDate: string | null }[],
  substanceById: Map<number, typeof substancesTable.$inferSelect>,
): string {
  const canonical = [...items].sort((a, b) => a.substanceId - b.substanceId).map(item => {
    const substance = substanceById.get(item.substanceId);
    let durationSeconds: number | null = null;
    if (substance) {
      try {
        durationSeconds = durationSecondsFromMinutes(substanceDurationMinutes(substance));
      } catch {
        durationSeconds = null;
      }
    }
    return [
      item.substanceId, item.dose, item.totalSessions, item.intervalDays, item.startDate,
      substance ? [substance.doctorParticipation, durationSeconds] : null,
    ];
  });
  return createHash("sha256").update(JSON.stringify([protocolStartDate, canonical])).digest("hex").slice(0, 32);
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const isPositiveInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/** Estrutura do pedido, sem tocar no banco. */
function assertWellFormed(params: ReserveProtocolVisitsParams): void {
  const invalid = (error: string) => refuse(400, "visitas_invalidas", error);
  for (const key of ["empresaId", "clientId", "protocolId", "nursingResourceId"] as const) {
    if (!isPositiveInt(params[key])) invalid("Identificadores inválidos");
  }
  if (params.expectedSnapshot !== undefined &&
      (typeof params.expectedSnapshot !== "string" || !/^[0-9a-f]{32}$/.test(params.expectedSnapshot))) {
    invalid("Fotografia do protocolo inválida");
  }
  if (!Array.isArray(params.visits) || params.visits.length === 0) invalid("Nenhuma visita para reservar");
  if (params.visits.length > MAX_RESERVATION_VISITS) {
    invalid(`Visitas demais para uma única reserva (máximo ${MAX_RESERVATION_VISITS})`);
  }
  const dates = new Set<string>();
  for (const visit of params.visits) {
    if (!validDate(visit?.date) || typeof visit.time !== "string" || !HHMM.test(visit.time)) {
      invalid("Data ou horário de visita inválido");
    }
    if (dates.has(visit.date)) invalid("Duas visitas no mesmo dia para o mesmo cliente");
    dates.add(visit.date);
    if (!Array.isArray(visit.applications) || visit.applications.length === 0 ||
        visit.applications.length > MAX_APPLICATIONS_PER_VISIT ||
        visit.applications.some(a => !isPositiveInt(a?.substanceId) || !isPositiveInt(a?.sessionNumber))) {
      invalid("Aplicações da visita inválidas");
    }
  }
}

/**
 * Erros conhecidos da fonte de vagas que significam "pedido recusado" (e não falha do servidor).
 * Compartilhada com o agendamento por protocolo, para que prévia e reserva falem igual.
 */
export function classifySlotSourceError(
  error: unknown,
): { status: 404 | 422; code: "agenda_nao_encontrada" | "agenda_invalida"; error: string } | null {
  const message = error instanceof Error ? error.message : "";
  if (message === "Agenda não encontrada ou inativa") {
    return { status: 404, code: "agenda_nao_encontrada", error: message };
  }
  if (message === "A agenda informada não é de enfermagem" || message.includes("horários de 20 minutos")) {
    return { status: 422, code: "agenda_invalida", error: message };
  }
  return null;
}

/** Erros conhecidos do motor/fonte de vagas viram recusa; qualquer outro continua sendo erro. */
function refusalFromSlotSource(error: unknown): never {
  const known = classifySlotSourceError(error);
  if (known) refuse(known.status, known.code, known.error);
  throw error;
}

export async function reserveProtocolVisits(
  params: ReserveProtocolVisitsParams,
): Promise<ReserveProtocolVisitsResult> {
  try {
    assertWellFormed(params);
    return await db.transaction(async (tx): Promise<ReserveProtocolVisitsResult> => {
      const visits = [...params.visits].sort((a, b) => a.date.localeCompare(b.date));

      // 1. Bloqueio por empresa (o mesmo da marcação avulsa) e pertencimento da agenda.
      const empresaId = await lockAgendaResource(tx, params.nursingResourceId);
      if (!empresaId || empresaId !== params.empresaId) {
        return refuse(404, "agenda_nao_encontrada", "Agenda não encontrada ou inativa");
      }
      const [resource] = await tx.select({ name: agendaResourcesTable.name, modality: agendaResourcesTable.modality })
        .from(agendaResourcesTable).where(eq(agendaResourcesTable.id, params.nursingResourceId));
      // Esta etapa só habilita a enfermagem LOCAL; domiciliar e online têm outras regras de deslocamento e expediente.
      if (resource?.modality !== "local") {
        return refuse(422, "agenda_invalida", "A reserva por períodos só está habilitada para a agenda de enfermagem local");
      }

      // 2. Cliente e protocolo, relidos já sob o bloqueio.
      const [client] = await tx.select({ id: clientsTable.id, empresaId: clientsTable.empresaId })
        .from(clientsTable).where(eq(clientsTable.id, params.clientId));
      if (!client || client.empresaId !== empresaId) {
        return refuse(404, "cliente_nao_encontrado", "Cliente não encontrado");
      }
      const [protocol] = await tx.select().from(protocolsTable)
        .where(eq(protocolsTable.id, params.protocolId)).for("update");
      if (!protocol || protocol.clientId !== params.clientId || protocol.empresaId !== empresaId) {
        return refuse(404, "protocolo_nao_encontrado", "Protocolo não pertence ao cliente");
      }
      const anySession = await tx.select({ id: sessionsTable.id }).from(sessionsTable)
        .where(eq(sessionsTable.protocolId, protocol.id)).limit(1);
      if (anySession.length > 0) {
        return refuse(409, "protocolo_ja_agendado",
          "Protocolo já tem sessões; confira o histórico sem recriar os agendamentos");
      }
      if (protocol.status !== "suggested") {
        return refuse(409, "protocolo_status_invalido", "O protocolo precisa estar sugerido para ser agendado");
      }

      // 3. O plano precisa cobrir exatamente as aplicações do protocolo.
      const items = await tx.select().from(protocolItemsTable)
        .where(eq(protocolItemsTable.protocolId, protocol.id));
      if (items.length === 0 || new Set(items.map(i => i.substanceId)).size !== items.length ||
          items.some(i => !isPositiveInt(i.totalSessions))) {
        return refuse(422, "protocolo_incompleto",
          "Confira as substâncias e as quantidades de sessões antes de agendar");
      }
      const itemBySubstance = new Map(items.map(item => [item.substanceId, item]));
      const seen = new Set<string>();
      const datesBySubstance = new Map<number, Map<number, string>>();
      for (const visit of visits) {
        const inVisit = new Set<number>();
        for (const app of visit.applications) {
          const item = itemBySubstance.get(app.substanceId);
          const key = `${app.substanceId}:${app.sessionNumber}`;
          if (!item || app.sessionNumber > item.totalSessions || seen.has(key) || inVisit.has(app.substanceId)) {
            return refuse(422, "plano_incoerente", "O plano não corresponde às aplicações do protocolo",
              { date: visit.date });
          }
          seen.add(key);
          inVisit.add(app.substanceId);
          const byNumber = datesBySubstance.get(app.substanceId) ?? new Map<number, string>();
          byNumber.set(app.sessionNumber, visit.date);
          datesBySubstance.set(app.substanceId, byNumber);
        }
      }
      for (const item of items) {
        const byNumber = datesBySubstance.get(item.substanceId);
        let previous = "";
        for (let number = 1; number <= item.totalSessions; number++) {
          const date = byNumber?.get(number);
          // Falta aplicação, ou a ordem cronológica não acompanha a numeração. O laço para na primeira
          // ausência, então o custo é limitado pelo tamanho do plano mesmo que o total gravado seja enorme.
          if (!date || date <= previous) {
            return refuse(422, "plano_incoerente", "O plano não corresponde às aplicações do protocolo");
          }
          previous = date;
        }
      }

      // 4. Dimensionamento de cada visita a partir do catálogo (nunca do plano).
      const substances = await tx.select().from(substancesTable)
        .where(inArray(substancesTable.id, items.map(i => i.substanceId)));
      const substanceById = new Map(substances.map(s => [s.id, s]));
      if (params.expectedSnapshot !== undefined &&
          protocolPlanSnapshot(protocol.startDate, items, substanceById) !== params.expectedSnapshot) {
        return refuse(409, "plano_mudou",
          "Os dados do protocolo mudaram desde a prévia (dose, quantidade, intervalo, data ou duração). Nada foi agendado.");
      }
      const periodsByDate = new Map<string, number>();
      for (const visit of visits) {
        const sized = visit.applications.map(app => {
          const substance = substanceById.get(app.substanceId);
          if (!substance) {
            return refuse(422, "plano_incoerente", "O plano não corresponde às aplicações do protocolo",
              { date: visit.date });
          }
          if (substance.doctorParticipation == null) {
            return refuse(422, "participacao_medica_indefinida",
              `Participação médica não definida para a substância ${substance.id}`, { date: visit.date });
          }
          let durationSeconds: number;
          try {
            durationSeconds = durationSecondsFromMinutes(substanceDurationMinutes(substance));
          } catch {
            return refuse(422, "substancia_sem_duracao",
              `Duração não definida para a substância ${substance.id}`, { date: visit.date });
          }
          return { durationSeconds, requiresDoctor: substance.doctorParticipation };
        });
        const sizing = sizeVisit(sized);
        if (sizing.requiresDoctor) {
          return refuse(422, "medico_nao_habilitado",
            "Reserva com médico ainda não habilitada: não há agenda médica com expediente para reservar",
            { date: visit.date });
        }
        periodsByDate.set(visit.date, sizing.nursingPeriods);
      }

      // 5. Cliente com no máximo uma visita por dia.
      const sameDay = await tx.select({ date: sessionsTable.scheduledDate }).from(sessionsTable)
        .where(and(
          eq(sessionsTable.clientId, params.clientId),
          inArray(sessionsTable.scheduledDate, visits.map(v => v.date)),
          inArray(sessionsTable.status, LIVE_SESSION_STATUSES),
          eq(sessionsTable.agendaArchived, false),
        )).limit(1);
      if (sameDay.length > 0) {
        return refuse(409, "cliente_ja_tem_visita_no_dia",
          `O cliente já tem uma visita em ${brDate(sameDay[0].date)}`, { date: sameDay[0].date });
      }

      // 6. Releitura do motor verdadeiro para cada visita, ainda sem gravar nada.
      for (const visit of visits) {
        const needed = periodsByDate.get(visit.date)!;
        let source;
        try {
          source = await loadProtocolSlots({
            empresaId, nursingResourceId: params.nursingResourceId,
            fromDate: visit.date, toDate: visit.date, executor: tx,
          });
        } catch (error) {
          return refusalFromSlotSource(error);
        }
        const where = { date: visit.date, time: visit.time };
        const { diagnostics } = source;
        if (diagnostics.integrationPendingDates.includes(visit.date)) {
          return refuse(409, "agenda_desatualizada",
            `A agenda do Google de ${brDate(visit.date)} está desatualizada; tente de novo depois da atualização`, where);
        }
        if (diagnostics.nursingDatesWithoutSchedule.includes(visit.date)) {
          return refuse(409, "dia_sem_expediente", `Não há expediente da enfermagem em ${brDate(visit.date)}`, where);
        }
        if (diagnostics.nursingDatesWithException.includes(visit.date)) {
          return refuse(409, "dia_com_excecao", `A enfermagem não atende em ${brDate(visit.date)} (exceção cadastrada)`, where);
        }
        const slot = source.slots.find(s => s.time === visit.time);
        const available = slot?.capacityPeriods ?? 0;
        if (available < needed) {
          return refuse(409, "horario_indisponivel",
            `O horário ${visit.time} de ${brDate(visit.date)} precisa de ${needed} período(s) livre(s) e seguido(s); há ${available}`,
            where);
        }
      }

      // 7. Gravação: uma sessão por visita, com as aplicações e o protocolo validado.
      const lastDateBySubstance = new Map<number, string>();
      for (const [substanceId, byNumber] of datesBySubstance) {
        lastDateBySubstance.set(substanceId, [...byNumber.values()].sort().at(-1)!);
      }
      const reserved: ReservedVisit[] = [];
      for (const [index, visit] of visits.entries()) {
        const periods = periodsByDate.get(visit.date)!;
        const [session] = await tx.insert(sessionsTable).values({
          protocolId: protocol.id, clientId: params.clientId, professionalId: protocol.professionalId,
          resourceId: params.nursingResourceId, durationMinutes: periods * NURSING_PERIOD_MINUTES,
          scheduledDate: visit.date, scheduledTime: visit.time, status: "scheduled",
          unit: protocol.unit ?? resource?.name ?? null, serviceType: protocol.serviceType,
          weekNumber: index + 1, notes: params.simulate ? SIM_TAG : null, empresaId,
        }).returning();
        const inThisVisit = new Set(visit.applications.map(a => a.substanceId));
        await tx.insert(substanceApplicationsTable).values([
          ...visit.applications.map(app => {
            const item = itemBySubstance.get(app.substanceId)!;
            return {
              sessionId: session.id, substanceId: item.substanceId, dose: item.dose,
              sessionNumber: app.sessionNumber, totalSessions: item.totalSessions,
              status: "pending", availability: "disp",
            };
          }),
          // Substâncias que ainda voltam em visita posterior aparecem como "prox".
          ...items.filter(item => !inThisVisit.has(item.substanceId) &&
              lastDateBySubstance.get(item.substanceId)! > visit.date)
            .map(item => ({
              sessionId: session.id, substanceId: item.substanceId, dose: item.dose,
              sessionNumber: 0, totalSessions: item.totalSessions,
              status: "pending", availability: "prox",
            })),
        ]);
        reserved.push({
          sessionId: session.id, date: visit.date, time: visit.time, nursingPeriods: periods,
          reservedMinutes: periods * NURSING_PERIOD_MINUTES,
          applications: visit.applications.map(a => ({ substanceId: a.substanceId, sessionNumber: a.sessionNumber })),
        });
      }
      await tx.update(protocolsTable)
        .set({ status: "validated", scheduledTime: visits[0].time })
        .where(eq(protocolsTable.id, protocol.id));
      return { ok: true, protocolStatus: "validated", visits: reserved };
    });
  } catch (error) {
    if (error instanceof ReservationRefusal) return error.refusal;
    throw error;
  }
}
