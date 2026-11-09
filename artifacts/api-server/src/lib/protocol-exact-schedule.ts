import { assertDurationSeconds, periodsForSeconds, sizeVisit, type VisitSizing } from "./protocol-visit-sizing";

/** Date-only arithmetic: no current clock and no implicit server timezone. */
export interface ExactScheduleItem {
  substanceId: number;
  dose: string;
  totalSessions: number;
  intervalDays: number;
  startDate?: string | null;
  /**
   * Modo por tempo: se QUALQUER substância informar a duração, todas devem
   * informar duração e participação médica, e toda vaga deve informar a
   * capacidade em períodos. Sem isso vale apenas o limite por quantidade.
   */
  durationSeconds?: number;
  /** null/undefined no modo por tempo = não definido; nunca presumido. */
  requiresDoctor?: boolean | null;
}
export interface ExactApplication {
  substanceId: number;
  dose: string;
  sessionNumber: number;
  totalSessions: number;
}
export interface ExactAppointment {
  date: string;
  applications: ExactApplication[];
  upcoming: ExactScheduleItem[];
}
function dayMs(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Data inicial inválida");
  const ms = Date.parse(`${value}T12:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) {
    throw new Error("Data inicial inválida");
  }
  return ms;
}
export function buildExactProtocolSchedule(startDate: string, items: ExactScheduleItem[]): ExactAppointment[] {
  dayMs(startDate);
  if (!items.length) throw new Error("Protocolo sem substâncias");
  if (new Set(items.map(item => item.substanceId)).size !== items.length) {
    throw new Error("Substância repetida no protocolo");
  }
  const byDate = new Map<string, ExactApplication[]>();
  const futureDates = new Map<ExactScheduleItem, string[]>();
  for (const item of items) {
    if (!Number.isSafeInteger(item.totalSessions) || item.totalSessions <= 0 ||
        !Number.isSafeInteger(item.intervalDays) || item.intervalDays <= 0) {
      throw new Error("Quantidade de sessões ou intervalo inválido");
    }
    const origin = dayMs(item.startDate ?? startDate);
    const dates: string[] = [];
    for (let index = 0; index < item.totalSessions; index++) {
      const ms = origin + index * item.intervalDays * 86_400_000;
      const date = new Date(ms).toISOString().slice(0, 10);
      dayMs(date);
      dates.push(date);
      const apps = byDate.get(date) ?? [];
      apps.push({
        substanceId: item.substanceId, dose: item.dose,
        sessionNumber: index + 1, totalSessions: item.totalSessions,
      });
      byDate.set(date, apps);
    }
    futureDates.set(item, dates);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, applications]) => ({
    date,
    applications,
    upcoming: items.filter(item =>
      !applications.some(app => app.substanceId === item.substanceId) &&
      futureDates.get(item)!.some(next => next > date)),
  }));
}

/**
 * Planejamento puro: recebe vagas previamente calculadas pelo motor da agenda.
 * Não reserva recursos, não escreve no banco e não confirma o cliente.
 * A busca limitada pode não encontrar uma solução existente.
 */
export interface AvailableProtocolSlot {
  date: string;
  time: string;
  /** Capacidade já verificada pelo motor para ESTE horário e seus períodos adjacentes. */
  maxApplications: number;
  /** Ordem de preferência informada pelo cadastro; ausência não é confirmação. */
  preferenceRank?: number;
  /** Períodos de 20 minutos, consecutivos e livres, da enfermagem a partir deste horário. */
  capacityPeriods?: number;
  /**
   * Períodos de 20 minutos, a partir deste horário, em que o médico também está
   * livre. A unidade é o tempo RESERVADO, não o tempo clínico: a visita precisa
   * do médico durante todos os períodos que reserva. Ausente ou zero = indisponível.
   */
  doctorCapacityPeriods?: number;
}
export interface PlannedProtocolApplication extends ExactApplication {
  nominalDate: string;
}
export interface PlannedProtocolVisit {
  date: string;
  time: string;
  applications: PlannedProtocolApplication[];
  /** Presente apenas no modo por tempo: períodos de enfermagem e médico exigidos. */
  sizing?: VisitSizing;
}
export interface ProtocolPlanningRestriction {
  substanceId: number;
  /** 0 = domingo, 1 = segunda ... 6 = sábado. Vazio não autoriza nenhum dia. */
  allowedWeekdays?: number[];
  /** Datas autorizadas explicitamente. Vazio não autoriza nenhuma data. */
  allowedDates?: string[];
  /** Última aplicação comprovada, quando conhecida; não presume ausência de histórico. */
  lastAppliedDate?: string;
}
export type ConsolidatedPlan =
  | { ok: true; visits: PlannedProtocolVisit[]; requiresRoutineConfirmation: boolean;
      clinicalAndResourceValidationRequired: true; searchWasPruned: boolean; globallyOptimal: false }
  | { ok: false; reason: "nenhum_plano_encontrado" | "limite_busca_atingido"; globallyOptimal: false };

const DAY_MS = 86_400_000;
const PLANNING_BEAM_WIDTH = 1000;
const MAX_PLAN_EXPANSIONS = 300_000;
/** Limite de vagas que o planejador aceita; fontes de vagas devem respeitá-lo. */
export const MAX_PLANNING_SLOTS = 5000;

function mondayOfWeek(date: string): string {
  const ms = dayMs(date);
  const weekday = new Date(ms).getUTCDay();
  return new Date(ms - ((weekday + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
}

export function planProtocolWithAvailableSlots(
  startDate: string,
  items: ExactScheduleItem[],
  slots: AvailableProtocolSlot[],
  limits: { toleranceDays: number; minIntervalReductionDays: number;
    restrictions?: ProtocolPlanningRestriction[] },
): ConsolidatedPlan {
  if (!Number.isInteger(limits.toleranceDays) || limits.toleranceDays < 0 || limits.toleranceDays > 4 ||
      !Number.isInteger(limits.minIntervalReductionDays) ||
      limits.minIntervalReductionDays < 0 || limits.minIntervalReductionDays > 4) {
    throw new Error("Limites de planejamento inválidos");
  }
  if (items.length > 100 || items.some(i => !Number.isSafeInteger(i.totalSessions) || i.totalSessions > 200) ||
      items.reduce((sum, i) => sum + i.totalSessions, 0) > 500 || slots.length > MAX_PLANNING_SLOTS ||
      items.some(i => !Number.isSafeInteger(i.substanceId) || i.substanceId <= 0 ||
        typeof i.dose !== "string" || !i.dose.trim())) {
    throw new Error("Protocolo ou conjunto de vagas excede o limite de planejamento");
  }
  const nominal = buildExactProtocolSchedule(startDate, items);
  const byId = new Map(items.map(i => [i.substanceId, i]));
  // Modo por tempo: ativado quando qualquer substância informa a duração.
  const timeMode = items.some(i => i.durationSeconds !== undefined);
  if (timeMode) {
    for (const item of items) {
      assertDurationSeconds(item.durationSeconds);
      if (typeof item.requiresDoctor !== "boolean") {
        throw new Error("Participação médica não definida para a substância");
      }
    }
  } else if (slots.some(slot => slot.capacityPeriods !== undefined || slot.doctorCapacityPeriods !== undefined)) {
    throw new Error("Capacidade em períodos exige a duração de todas as substâncias");
  }
  const restrictions = new Map<number, {
    allowedWeekdays?: Set<number>;
    allowedDates?: Set<string>;
    lastAppliedMs?: number;
  }>();
  if ((limits.restrictions?.length ?? 0) > items.length) throw new Error("Restrições demais");
  let totalRestrictedDates = 0;
  for (const restriction of limits.restrictions ?? []) {
    if (!byId.has(restriction.substanceId) || restrictions.has(restriction.substanceId) ||
        (restriction.allowedWeekdays != null && !Array.isArray(restriction.allowedWeekdays)) ||
        (restriction.allowedDates != null && !Array.isArray(restriction.allowedDates)) ||
        (restriction.allowedWeekdays?.length ?? 0) > 7 ||
        restriction.allowedWeekdays?.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
      throw new Error("Restrição de substância inválida");
    }
    totalRestrictedDates += restriction.allowedDates?.length ?? 0;
    if (totalRestrictedDates > 5000) throw new Error("Restrições de datas excedem o limite");
    for (const date of restriction.allowedDates ?? []) dayMs(date);
    restrictions.set(restriction.substanceId, {
      allowedDates: restriction.allowedDates != null ? new Set(restriction.allowedDates) : undefined,
      allowedWeekdays: restriction.allowedWeekdays != null ? new Set(restriction.allowedWeekdays) : undefined,
      lastAppliedMs: restriction.lastAppliedDate != null ? dayMs(restriction.lastAppliedDate) : undefined,
    });
  }
  const sortedSlots = [...slots].sort((a, b) =>
    a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const seen = new Set<string>();
  const equivalentSlots = new Map<string, AvailableProtocolSlot>();
  for (const slot of sortedSlots) {
    dayMs(slot.date);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.time) ||
        !Number.isSafeInteger(slot.maxApplications) || slot.maxApplications <= 0 ||
        (slot.preferenceRank != null && (!Number.isSafeInteger(slot.preferenceRank) || slot.preferenceRank < 1))) {
      throw new Error("Vaga inválida");
    }
    if (timeMode) {
      if (!Number.isSafeInteger(slot.capacityPeriods) || (slot.capacityPeriods as number) <= 0 ||
          (slot.doctorCapacityPeriods !== undefined &&
            (!Number.isSafeInteger(slot.doctorCapacityPeriods) || slot.doctorCapacityPeriods < 0))) {
        throw new Error("Vaga sem capacidade em períodos válida");
      }
    }
    const key = `${slot.date} ${slot.time}`;
    if (seen.has(key)) throw new Error("Vaga duplicada");
    seen.add(key);
    // Mesma data e capacidade têm o mesmo efeito na viabilidade desta busca.
    // Conservar a opção mais preferida e, em empate, o horário mais cedo.
    const equivalentKey =
      `${slot.date} ${slot.maxApplications} ${slot.capacityPeriods ?? ""} ${slot.doctorCapacityPeriods ?? ""}`;
    const prior = equivalentSlots.get(equivalentKey);
    if (!prior || (slot.preferenceRank ?? 10000) < (prior.preferenceRank ?? 10000)) {
      equivalentSlots.set(equivalentKey, slot);
    }
  }
  const orderedSlots = [...equivalentSlots.values()].sort((a, b) =>
    a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const slotsWithDates = orderedSlots.map(slot => {
    const ms = dayMs(slot.date);
    return { slot, ms, weekday: new Date(ms).getUTCDay() };
  });
  const occurrences = nominal.flatMap(row =>
    row.applications.map(application => ({ ...application, nominalDate: row.date })))
    .sort((a, b) => a.nominalDate.localeCompare(b.nominalDate) ||
      a.substanceId - b.substanceId || a.sessionNumber - b.sessionNumber);
  let totalOptions = 0;
  const optionsByOccurrence: typeof slotsWithDates[] = [];
  for (const occurrence of occurrences) {
    const item = byId.get(occurrence.substanceId)!;
    const restriction = restrictions.get(occurrence.substanceId);
    const nominalMs = dayMs(occurrence.nominalDate);
    const initialMs = dayMs(item.startDate ?? startDate);
    const options = slotsWithDates.filter(({ ms, slot, weekday }) =>
      Math.abs(ms - nominalMs) <= limits.toleranceDays * DAY_MS &&
      (occurrence.sessionNumber !== 1 || ms >= initialMs) &&
      (!restriction?.allowedDates || restriction.allowedDates.has(slot.date)) &&
      (!restriction?.allowedWeekdays || restriction.allowedWeekdays.has(weekday)));
    if (!options.length) return { ok: false, reason: "nenhum_plano_encontrado", globallyOptimal: false };
    totalOptions += options.length;
    if (totalOptions > MAX_PLAN_EXPANSIONS) {
      return { ok: false, reason: "limite_busca_atingido", globallyOptimal: false };
    }
    optionsByOccurrence.push(options);
  }
  const beamWidth = Math.min(PLANNING_BEAM_WIDTH, Math.floor(MAX_PLAN_EXPANSIONS / totalOptions));

  type Candidate = {
    visits: Map<string, PlannedProtocolVisit>;
    lastBySubstance: Map<number, number>;
    displacement: number;
    ranking?: [number, number, number, number, string];
  };
  let candidates: Candidate[] = [{ visits: new Map(), lastBySubstance: new Map(), displacement: 0 }];
  let truncated = false;
  let expansions = 0;
  const slotsByKey = new Map(orderedSlots.map(slot => [`${slot.date} ${slot.time}`, slot]));
  const rank = (candidate: Candidate): [number, number, number, number, string] => {
    if (candidate.ranking) return candidate.ranking;
    const visits = [...candidate.visits.values()];
    const weeks = new Set(visits.map(visit => mondayOfWeek(visit.date)));
    const preference = visits.reduce((sum, visit) =>
      sum + (slotsByKey.get(`${visit.date} ${visit.time}`)?.preferenceRank ?? 10000), 0);
    return candidate.ranking = [visits.length - weeks.size, visits.length, candidate.displacement, preference,
      [...candidate.visits.keys()].sort().join("|")];
  };
  const compare = (a: Candidate, b: Candidate) => {
    const ar = rank(a), br = rank(b);
    for (let i = 0; i < 4; i++) {
      const difference = (ar[i] as number) - (br[i] as number);
      if (difference) return difference;
    }
    return (ar[4] as string).localeCompare(br[4] as string);
  };
  for (const [occurrenceIndex, occurrence] of occurrences.entries()) {
    const item = byId.get(occurrence.substanceId)!;
    const restriction = restrictions.get(occurrence.substanceId);
    const nominalMs = dayMs(occurrence.nominalDate);
    const minimumInterval = item.intervalDays <= 4
      ? item.intervalDays : Math.max(1, item.intervalDays - limits.minIntervalReductionDays);
    const possibleSlots = optionsByOccurrence[occurrenceIndex];
    const next: Candidate[] = [];
    for (const candidate of candidates) for (const { slot, ms } of possibleSlots) {
      if (++expansions > MAX_PLAN_EXPANSIONS) {
        return { ok: false, reason: "limite_busca_atingido", globallyOptimal: false };
      }
      const previous = candidate.lastBySubstance.get(item.substanceId) ?? restriction?.lastAppliedMs;
      if (previous != null && ms - previous < minimumInterval * DAY_MS) continue;
      const key = `${slot.date} ${slot.time}`;
      const existing = candidate.visits.get(key);
      if (existing && existing.applications.length >= slot.maxApplications) continue;
      if (timeMode) {
        // Períodos que a visita reservaria COM esta ocorrência. Se qualquer
        // aplicação da visita (já alocada ou a que chega agora) exigir o médico,
        // ele precisa cobrir todos esses períodos, e não só o tempo clínico.
        const together = [...(existing?.applications ?? []), occurrence];
        const needed = periodsForSeconds(
          together.reduce((sum, app) => sum + byId.get(app.substanceId)!.durationSeconds!, 0));
        const needsDoctor = together.some(app => byId.get(app.substanceId)!.requiresDoctor === true);
        const available = needsDoctor
          ? Math.min(slot.capacityPeriods!, slot.doctorCapacityPeriods ?? 0)
          : slot.capacityPeriods!;
        if (needed > available) continue;
      }
      // A capacidade da vaga já inclui os períodos adjacentes comprovados.
      // Duas vagas independentes no mesmo dia não provam adjacência e não
      // devem virar duas visitas separadas para o mesmo cliente.
      if (!existing && [...candidate.visits.values()].some(visit => visit.date === slot.date)) continue;
      // Uma mesma substância não pode ter duas ocorrências no mesmo dia,
      // inclusive quando são oferecidos horários diferentes.
      if ([...candidate.visits.values()].some(visit => visit.date === slot.date &&
          visit.applications.some(app => app.substanceId === occurrence.substanceId))) continue;
      const visits = new Map(candidate.visits);
      visits.set(key, { date: slot.date, time: slot.time,
        applications: [...(existing?.applications ?? []), occurrence] });
      const lastBySubstance = new Map(candidate.lastBySubstance);
      lastBySubstance.set(item.substanceId, ms);
      next.push({ visits, lastBySubstance,
        displacement: candidate.displacement + Math.abs(ms - nominalMs) / DAY_MS });
      // Mantém os melhores estados sem acumular todos os sucessores.
      if (next.length > beamWidth * 3) {
        next.sort(compare);
        next.length = beamWidth;
        truncated = true;
      }
    }
    if (!next.length) return { ok: false,
      reason: truncated ? "limite_busca_atingido" : "nenhum_plano_encontrado", globallyOptimal: false };
    next.sort(compare);
    if (next.length > beamWidth) truncated = true;
    candidates = next.slice(0, beamWidth);
  }
  const visits = [...candidates[0].visits.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  if (timeMode) {
    for (const visit of visits) {
      visit.sizing = sizeVisit(visit.applications.map(app => ({
        durationSeconds: byId.get(app.substanceId)!.durationSeconds!,
        requiresDoctor: byId.get(app.substanceId)!.requiresDoctor,
      })));
    }
  }
  const counts = new Map<string, number>();
  for (const visit of visits) {
    const week = mondayOfWeek(visit.date);
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  return {
    ok: true, visits,
    requiresRoutineConfirmation: [...counts.values()].some(count => count > 1),
    clinicalAndResourceValidationRequired: true,
    searchWasPruned: truncated,
    globallyOptimal: false,
  };
}
