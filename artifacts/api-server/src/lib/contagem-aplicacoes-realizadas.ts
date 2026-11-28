import { estadoAplicacao } from "./estado-aplicacao-protocolo";

/**
 * Conta apenas aplicações efetivamente registradas, não sessões encerradas.
 * A numeração da aplicação é sua ocorrência dentro da substância no protocolo.
 */
export function contarAplicacoesRealizadas(
  sessionIds: number[],
  applications: { sessionId: number; substanceId: number; sessionNumber: number;
    availability: string; status: string; appliedAt: string | null }[],
) {
  const allowed = new Set(sessionIds);
  const visits = new Set<number>();
  const occurrences = new Map<number, Set<number>>();
  for (const app of applications) {
    if (!allowed.has(app.sessionId) || app.availability !== "disp" ||
        estadoAplicacao(app) !== "applied" ||
        !Number.isInteger(app.sessionNumber) || app.sessionNumber <= 0) continue;
    visits.add(app.sessionId);
    const numbers = occurrences.get(app.substanceId) ?? new Set<number>();
    numbers.add(app.sessionNumber);
    occurrences.set(app.substanceId, numbers);
  }
  return {
    visits,
    bySubstance: new Map([...occurrences].map(([id, numbers]) => [id, numbers.size])),
  };
}
