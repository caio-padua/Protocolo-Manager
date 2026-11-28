const DAY_MS = 86_400_000;

export interface WindowSnapshot {
  weekday: number;
  startTime: string;
  endTime: string;
  repeatWeeks?: number;
  anchorDate?: string | null;
}

export function canonicalWindows(windows: WindowSnapshot[]) {
  return windows.map(w => ({
    weekday: Number(w.weekday), startTime: w.startTime, endTime: w.endTime,
    repeatWeeks: Number(w.repeatWeeks ?? 1), anchorDate: w.anchorDate ?? null,
  })).sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)
    || a.endTime.localeCompare(b.endTime) || a.repeatWeeks - b.repeatWeeks
    || (a.anchorDate ?? "").localeCompare(b.anchorDate ?? ""));
}

function dateMs(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
}

/**
 * Padrões de repetição de uma janela de atendimento (coluna agenda_windows.repeat_weeks).
 *  1                      = toda semana
 *  2, 3, 4, 6, 8          = a cada N semanas, contando da data inicial (mesmo dia da semana)
 *  101, 102, 103, 104     = 1ª, 2ª, 3ª ou 4ª ocorrência do dia da semana em cada mês
 *  105                    = última ocorrência do dia da semana em cada mês
 * Os códigos mensais começam em 100 para nunca se confundirem com um número de semanas.
 */
export const INTERVALOS_EM_SEMANAS = [1, 2, 3, 4, 6, 8] as const;
export const MENSAL_PRIMEIRO = 101;
export const MENSAL_ULTIMO = 105;

export function ehMensal(repeatWeeks: number): boolean {
  return Number.isInteger(repeatWeeks) && repeatWeeks >= MENSAL_PRIMEIRO && repeatWeeks <= MENSAL_ULTIMO;
}
function ehIntervalo(repeatWeeks: number): boolean {
  return (INTERVALOS_EM_SEMANAS as readonly number[]).includes(repeatWeeks);
}

export function validWindowRecurrence(weekday: number, repeatWeeks: number, anchorDate: string | null): boolean {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return false;
  if (repeatWeeks === 1 || ehMensal(repeatWeeks)) return anchorDate === null;
  if (!ehIntervalo(repeatWeeks) || !anchorDate) return false;
  const ms = dateMs(anchorDate);
  return ms !== null && new Date(ms).getUTCDay() === weekday;
}

/** Posição do dia dentro do mês: 1..5 (1ª ocorrência, 2ª...) e se é a última do mês. */
function ocorrenciaNoMes(ms: number): { ordem: number; ultima: boolean } {
  const d = new Date(ms);
  return { ordem: Math.ceil(d.getUTCDate() / 7), ultima: new Date(ms + 7 * DAY_MS).getUTCMonth() !== d.getUTCMonth() };
}

export function windowOccursOnDate(
  window: { weekday: number; repeatWeeks: number; anchorDate: string | null },
  date: string,
): boolean {
  const ms = dateMs(date);
  if (ms === null || !validWindowRecurrence(window.weekday, window.repeatWeeks, window.anchorDate)
      || new Date(ms).getUTCDay() !== window.weekday) return false;
  if (window.repeatWeeks === 1) return true;
  if (ehMensal(window.repeatWeeks)) {
    const { ordem, ultima } = ocorrenciaNoMes(ms);
    return window.repeatWeeks === MENSAL_ULTIMO ? ultima : ordem === window.repeatWeeks - 100;
  }
  const anchor = dateMs(window.anchorDate!);
  if (anchor === null || ms < anchor) return false;
  return ((ms - anchor) / DAY_MS) % (7 * window.repeatWeeks) === 0;
}

type Padrao = { weekday: number; repeatWeeks: number; anchorDate: string | null };
const mdc = (a: number, b: number): number => (b === 0 ? a : mdc(b, a % b));

/** Dois padrões do mesmo dia da semana podem cair numa mesma data? (conservador: na dúvida, sim) */
export function padroesPodemCoincidir(a: Padrao, b: Padrao): boolean {
  if (a.weekday !== b.weekday) return false;
  if (a.repeatWeeks === 1 || b.repeatWeeks === 1) return true;
  if (ehMensal(a.repeatWeeks) && ehMensal(b.repeatWeeks)) {
    if (a.repeatWeeks === b.repeatWeeks) return true;
    const par = [a.repeatWeeks, b.repeatWeeks].sort();
    return par[0] === 104 && par[1] === 105; // 4ª e última coincidem em meses de 4 semanas
  }
  if (ehMensal(a.repeatWeeks) || ehMensal(b.repeatWeeks)) return true;
  const ma = dateMs(a.anchorDate ?? ""), mb = dateMs(b.anchorDate ?? "");
  if (ma === null || mb === null) return true;
  const semanas = Math.abs(ma - mb) / DAY_MS / 7;
  return semanas % mdc(a.repeatWeeks, b.repeatWeeks) === 0;
}

/** Há duas janelas que se sobrepõem em horário e podem cair na mesma data? */
export function janelasSobrepostas(windows: (Padrao & { startTime: string; endTime: string })[]): boolean {
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      const x = windows[i], y = windows[j];
      if (x.startTime < y.endTime && y.startTime < x.endTime && padroesPodemCoincidir(x, y)) return true;
    }
  }
  return false;
}
