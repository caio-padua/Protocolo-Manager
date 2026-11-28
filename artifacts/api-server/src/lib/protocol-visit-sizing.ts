/**
 * Dimensionamento puro de uma visita de enfermagem.
 *
 * Regra do responsável (ver specs/regras-agendamento-consultas-procedimentos.md):
 * cada período da enfermagem tem 20 minutos e preserva 5 minutos para
 * organização; sobram 15 minutos (900 segundos) de procedimento por período.
 * Uma aplicação intramuscular ou subcutânea dura 2,5 minutos (150 segundos),
 * logo uma a seis aplicações cabem em um período e a sétima exige outro.
 *
 * Este módulo não consulta banco, relógio nem agenda: apenas converte tempos
 * de procedimento em períodos. Quem reserva é outra camada.
 */
export const NURSING_PERIOD_MINUTES = 20;
export const NURSING_ORGANIZATION_MINUTES = 5;
export const USABLE_SECONDS_PER_PERIOD = (NURSING_PERIOD_MINUTES - NURSING_ORGANIZATION_MINUTES) * 60;

export interface SizedApplicationInput {
  /** Duração clínica da aplicação, em segundos inteiros positivos. */
  durationSeconds: number;
  /** null ou undefined = participação médica ainda não definida: nunca é presumida. */
  requiresDoctor: boolean | null | undefined;
}

export interface VisitSizing {
  totalSeconds: number;
  /** Períodos de 20 minutos, consecutivos, que a enfermagem precisa reservar. */
  nursingPeriods: number;
  /** Tempo reservado (não confundir com a duração clínica). */
  reservedMinutes: number;
  /** O médico precisa estar reservado durante todo o atendimento. */
  requiresDoctor: boolean;
}

export function assertDurationSeconds(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Duração da aplicação inválida");
  }
}

export function sizeVisit(applications: SizedApplicationInput[]): VisitSizing {
  if (!applications.length) throw new Error("Visita sem aplicações");
  let totalSeconds = 0;
  for (const application of applications) {
    assertDurationSeconds(application.durationSeconds);
    if (typeof application.requiresDoctor !== "boolean") {
      throw new Error("Participação médica não definida para a substância");
    }
    totalSeconds += application.durationSeconds;
  }
  const nursingPeriods = periodsForSeconds(totalSeconds);
  return {
    totalSeconds,
    nursingPeriods,
    reservedMinutes: nursingPeriods * NURSING_PERIOD_MINUTES,
    requiresDoctor: applications.some(application => application.requiresDoctor === true),
  };
}

/** Períodos inteiros de 20 minutos exigidos por um tempo total de procedimento. */
export function periodsForSeconds(totalSeconds: number): number {
  assertDurationSeconds(totalSeconds);
  return Math.ceil(totalSeconds / USABLE_SECONDS_PER_PERIOD);
}
