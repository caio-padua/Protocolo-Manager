import { and, eq } from "drizzle-orm";
import { agendaResourcesTable, db, locationsTable } from "@workspace/db";
import { computeResourceSlots } from "./agenda-booking";
import type { AgendaExecutor } from "./agenda-occupancy";
import type { EngineSlot } from "./agenda-motor";
import { MAX_PLANNING_SLOTS, type AvailableProtocolSlot } from "./protocol-exact-schedule";
import { NURSING_PERIOD_MINUTES, USABLE_SECONDS_PER_PERIOD } from "./protocol-visit-sizing";

/**
 * Fonte de vagas do planejador de protocolos.
 *
 * Lê o motor de agenda existente (a única fonte de disponibilidade) e o
 * converte em vagas medidas em períodos de 20 minutos reservados. Não decide
 * nada, não grava nada e não reserva nada: uma leitura é só uma fotografia.
 * Quem reservar precisa conferir de novo, dentro do bloqueio, antes de gravar.
 */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
/**
 * Limites da leitura. Medido em desenvolvimento: 73 a 130 ms por dia e por
 * agenda (o custo é de processamento no motor, que expande os compromissos
 * recorrentes do Google a cada dia; ler vários dias ao mesmo tempo não ganhou
 * tempo). O orçamento é em "agenda-dias": enfermagem sozinha pode ler 200 dias;
 * enfermagem com médico, 120 dias (240 agenda-dias, cerca de 30 s no pior caso).
 * Quem chama deve pedir só o período do protocolo, não o máximo.
 */
export const MAX_SLOT_SOURCE_DAYS = 200;
export const MAX_SLOT_SOURCE_AGENDA_DAYS = 240;
const KNOWN_REASONS = new Set(["sem-expediente", "excecao", "sincronizacao-pendente"]);

const toMinutes = (time: string): number => {
  if (!HHMM.test(time)) throw new Error("Horário de vaga inválido");
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};
const toTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export interface SlotSnapshot {
  time: string;
  state: EngineSlot["state"];
}

/**
 * Converte os horários de UM dia em vagas do planejador.
 *
 * Enfermagem: cada horário livre vira uma vaga cuja capacidade é a quantidade
 * de períodos livres e consecutivos a partir dele. Como todo horário livre é
 * uma possível largada, períodos adjacentes antes ou depois de um horário
 * aparecem naturalmente (a vaga das 09h00 e a das 09h20 descrevem a mesma
 * janela vista de pontos diferentes). Horários bloqueados, ocupados ou ainda
 * não liberados pela cadeia interrompem a sequência; o intervalo do almoço
 * também, porque não existe horário de 20 minutos dentro dele.
 *
 * Médico: a cobertura é a união dos horários abertos da agenda médica (grade
 * própria, em geral de 60 minutos, sem sobreposição). Um horário aberto das
 * 10h00 cobre três períodos de enfermagem. Quando a agenda médica é informada,
 * a cobertura é sempre numérica (zero = sem médico); quando não é, a
 * propriedade fica ausente.
 */
export function periodSlotsFromEngine(args: {
  date: string;
  nursing: SlotSnapshot[];
  doctor?: { slots: SlotSnapshot[]; slotMinutes: number } | null;
}): AvailableProtocolSlot[] {
  if (!ISO_DATE.test(args.date)) throw new Error("Data de vaga inválida");
  const nursing = args.nursing.map(slot => ({ start: toMinutes(slot.time), free: slot.state === "aberto" }))
    .sort((a, b) => a.start - b.start);
  for (let i = 1; i < nursing.length; i++) {
    if (nursing[i].start === nursing[i - 1].start) throw new Error("Horário duplicado na agenda de enfermagem");
  }
  const run = new Array<number>(nursing.length).fill(0);
  for (let i = nursing.length - 1; i >= 0; i--) {
    if (!nursing[i].free) continue;
    const next = nursing[i + 1];
    run[i] = 1 + (next && next.start === nursing[i].start + NURSING_PERIOD_MINUTES ? run[i + 1] : 0);
  }

  let doctorIntervals: { start: number; end: number }[] | null = null;
  if (args.doctor) {
    if (!Number.isSafeInteger(args.doctor.slotMinutes) || args.doctor.slotMinutes <= 0) {
      throw new Error("Duração do horário médico inválida");
    }
    const open = args.doctor.slots.filter(slot => slot.state === "aberto")
      .map(slot => ({ start: toMinutes(slot.time), end: toMinutes(slot.time) + args.doctor!.slotMinutes }))
      .sort((a, b) => a.start - b.start);
    doctorIntervals = [];
    for (const interval of open) {
      const last = doctorIntervals[doctorIntervals.length - 1];
      if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
      else doctorIntervals.push({ ...interval });
    }
  }

  const slots: AvailableProtocolSlot[] = [];
  nursing.forEach((entry, index) => {
    if (!run[index]) return;
    const slot: AvailableProtocolSlot = {
      date: args.date,
      time: toTime(entry.start),
      // O limite por quantidade é redundante no modo por tempo (o tempo manda):
      // nenhuma aplicação dura menos de um segundo.
      maxApplications: run[index] * USABLE_SECONDS_PER_PERIOD,
      capacityPeriods: run[index],
    };
    if (doctorIntervals) {
      let covered = 0;
      while (covered < run[index]) {
        const from = entry.start + covered * NURSING_PERIOD_MINUTES;
        const to = from + NURSING_PERIOD_MINUTES;
        if (!doctorIntervals.some(interval => interval.start <= from && to <= interval.end)) break;
        covered++;
      }
      slot.doctorCapacityPeriods = covered;
    }
    slots.push(slot);
  });
  return slots;
}

export interface ProtocolSlotDiagnostics {
  datesRead: number;
  /** Agenda de enfermagem sem expediente no dia da semana (ou sem janela ativa). */
  nursingDatesWithoutSchedule: string[];
  /** Dia com exceção cadastrada (feriado, fechamento). */
  nursingDatesWithException: string[];
  /** A agenda do Google não está atualizada: o dia NÃO é "sem vaga", é desconhecido. */
  integrationPendingDates: string[];
  /** Dia com expediente, mas sem nenhum horário aberto (ocupado, bloqueado ou antecedência). */
  nursingDatesWithoutOpenSlot: string[];
  /**
   * Só quando há agenda médica (dias em que a enfermagem tem expediente). Em todos
   * estes casos a cobertura médica é zero, mas o motivo é diferente e precisa
   * chegar a quem decide: "sem expediente" e "agenda do Google desatualizada" não
   * significam "médico ocupado".
   */
  doctorDatesWithoutSchedule: string[];
  doctorDatesWithException: string[];
  doctorIntegrationPendingDates: string[];
  /** Médico com expediente no dia, mas sem nenhum horário aberto. */
  doctorDatesWithoutOpenSlot: string[];
}

export interface ProtocolSlotSource {
  slots: AvailableProtocolSlot[];
  diagnostics: ProtocolSlotDiagnostics;
}

export interface ProtocolSlotSourceDeps {
  computeSlots: typeof computeResourceSlots;
  findResource: (resourceId: number, executor: AgendaExecutor) => Promise<
    { empresaId: number; kind: string; slotMinutes: number; active: boolean } | null>;
}

const defaultDeps: ProtocolSlotSourceDeps = {
  computeSlots: computeResourceSlots,
  async findResource(resourceId, executor) {
    const [row] = await executor.select({
      empresaId: locationsTable.empresaId, kind: agendaResourcesTable.kind,
      slotMinutes: agendaResourcesTable.slotMinutes, active: agendaResourcesTable.active,
    }).from(agendaResourcesTable)
      .innerJoin(locationsTable, eq(locationsTable.id, agendaResourcesTable.locationId))
      .where(and(eq(agendaResourcesTable.id, resourceId), eq(locationsTable.active, "true")));
    // Local sem empresa vinculada = sem dono conhecido: tratado como inexistente.
    return row && row.empresaId != null ? { ...row, empresaId: Number(row.empresaId) } : null;
  },
};

export function datesBetween(from: string, to: string): string[] {
  for (const value of [from, to]) {
    const parsed = new Date(`${value}T12:00:00Z`);
    if (!ISO_DATE.test(value) || !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== value) {
      throw new Error("Período de vagas inválido");
    }
  }
  const start = Date.parse(`${from}T12:00:00Z`);
  const end = Date.parse(`${to}T12:00:00Z`);
  const count = Math.round((end - start) / DAY_MS) + 1;
  if (count < 1) throw new Error("Período de vagas inválido");
  if (count > MAX_SLOT_SOURCE_DAYS) throw new Error("Período de vagas maior que o limite permitido");
  return Array.from({ length: count }, (_, day) => new Date(start + day * DAY_MS).toISOString().slice(0, 10));
}

async function requireResource(
  deps: ProtocolSlotSourceDeps, executor: AgendaExecutor, resourceId: number,
  empresaId: number, kind: "enfermagem" | "medico",
) {
  const resource = await deps.findResource(resourceId, executor);
  // Mesma resposta para inexistente e de outra empresa: não revela a existência.
  if (!resource || !resource.active || resource.empresaId !== empresaId) {
    throw new Error("Agenda não encontrada ou inativa");
  }
  if (resource.kind !== kind) {
    throw new Error(kind === "enfermagem" ? "A agenda informada não é de enfermagem" : "A agenda informada não é médica");
  }
  return resource;
}

/**
 * Lê o motor de agenda dia a dia e devolve as vagas do planejador mais um
 * diagnóstico honesto: dia sem expediente, com exceção ou com a agenda do
 * Google desatualizada não é o mesmo que dia sem vaga.
 */
export async function loadProtocolSlots(params: {
  empresaId: number;
  nursingResourceId: number;
  doctorResourceId?: number | null;
  fromDate: string;
  toDate: string;
  executor?: AgendaExecutor;
  deps?: ProtocolSlotSourceDeps;
}): Promise<ProtocolSlotSource> {
  const executor = params.executor ?? db;
  const deps = params.deps ?? defaultDeps;
  const dates = datesBetween(params.fromDate, params.toDate);
  if (dates.length * (params.doctorResourceId == null ? 1 : 2) > MAX_SLOT_SOURCE_AGENDA_DAYS) {
    throw new Error("Período de vagas maior que o limite permitido");
  }
  const nursing = await requireResource(deps, executor, params.nursingResourceId, params.empresaId, "enfermagem");
  if (nursing.slotMinutes !== NURSING_PERIOD_MINUTES) {
    // Não adivinhar: a regra de períodos de 20 minutos só vale numa grade de 20 minutos.
    throw new Error(`A agenda de enfermagem precisa ter horários de ${NURSING_PERIOD_MINUTES} minutos`);
  }
  const doctor = params.doctorResourceId == null ? null
    : await requireResource(deps, executor, params.doctorResourceId, params.empresaId, "medico");

  const diagnostics: ProtocolSlotDiagnostics = {
    datesRead: dates.length, nursingDatesWithoutSchedule: [], nursingDatesWithException: [],
    integrationPendingDates: [], nursingDatesWithoutOpenSlot: [],
    doctorDatesWithoutSchedule: [], doctorDatesWithException: [], doctorIntegrationPendingDates: [],
    doctorDatesWithoutOpenSlot: [],
  };

  const knownReason = (reason: string | null, who: string) => {
    if (reason !== null && !KNOWN_REASONS.has(reason)) {
      throw new Error(`Motivo de agenda ${who} não reconhecido: ${reason}`);
    }
    return reason;
  };
  type DayRead = {
    date: string; nursingReason: string | null; nursingSlots: SlotSnapshot[];
    doctor: { reason: string | null; slots: SlotSnapshot[] } | null;
  };
  const readDay = async (date: string): Promise<DayRead> => {
    const nursingDay = await deps.computeSlots(params.nursingResourceId, date, null, executor);
    if (!nursingDay) throw new Error("Agenda de enfermagem indisponível para leitura");
    const nursingReason = knownReason(nursingDay.result.reason, "de enfermagem");
    let doctorRead: DayRead["doctor"] = null;
    // Só vale perguntar pelo médico em dia em que a enfermagem atende.
    if (doctor && !nursingReason) {
      const doctorDay = await deps.computeSlots(params.doctorResourceId!, date, null, executor);
      if (!doctorDay) throw new Error("Agenda médica indisponível para leitura");
      const doctorReason = knownReason(doctorDay.result.reason, "médica");
      doctorRead = { reason: doctorReason, slots: doctorReason ? [] : doctorDay.result.slots };
    }
    return { date, nursingReason, nursingSlots: nursingDay.result.slots, doctor: doctorRead };
  };

  // Leitura dia a dia, em ordem: leituras simultâneas não ganharam tempo e,
  // dentro de uma transação, seriam enfileiradas de qualquer forma. Cada dia é
  // processado assim que lido, para recusar o excesso de vagas sem ler o resto.
  const slots: AvailableProtocolSlot[] = [];
  for (const date of dates) {
    const read = await readDay(date);
    if (read.nursingReason === "sincronizacao-pendente") { diagnostics.integrationPendingDates.push(read.date); continue; }
    if (read.nursingReason === "sem-expediente") { diagnostics.nursingDatesWithoutSchedule.push(read.date); continue; }
    if (read.nursingReason === "excecao") { diagnostics.nursingDatesWithException.push(read.date); continue; }
    if (read.doctor) {
      const { reason, slots: doctorSlots } = read.doctor;
      if (reason === "sem-expediente") diagnostics.doctorDatesWithoutSchedule.push(read.date);
      else if (reason === "excecao") diagnostics.doctorDatesWithException.push(read.date);
      else if (reason === "sincronizacao-pendente") diagnostics.doctorIntegrationPendingDates.push(read.date);
      else if (!doctorSlots.some(slot => slot.state === "aberto")) diagnostics.doctorDatesWithoutOpenSlot.push(read.date);
    }
    const daySlots = periodSlotsFromEngine({
      date: read.date, nursing: read.nursingSlots,
      // Médico informado mas ilegível/fechado no dia = cobertura zero (nunca presumida).
      doctor: doctor ? { slots: read.doctor?.slots ?? [], slotMinutes: doctor.slotMinutes } : null,
    });
    if (!daySlots.length) diagnostics.nursingDatesWithoutOpenSlot.push(read.date);
    slots.push(...daySlots);
    // Um período aceito aqui precisa ser aceito também por quem consome as vagas.
    if (slots.length > MAX_PLANNING_SLOTS) {
      throw new Error("Vagas demais para o planejador neste período; reduza o intervalo de datas");
    }
  }
  return { slots, diagnostics };
}
