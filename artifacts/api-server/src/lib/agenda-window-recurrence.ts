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

export function validWindowRecurrence(weekday: number, repeatWeeks: number, anchorDate: string | null): boolean {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return false;
  if (repeatWeeks === 1) return anchorDate === null;
  if (repeatWeeks !== 2 || !anchorDate) return false;
  const ms = dateMs(anchorDate);
  return ms !== null && new Date(ms).getUTCDay() === weekday;
}

export function windowOccursOnDate(
  window: { weekday: number; repeatWeeks: number; anchorDate: string | null },
  date: string,
): boolean {
  const ms = dateMs(date);
  if (ms === null || !validWindowRecurrence(window.weekday, window.repeatWeeks, window.anchorDate)
      || new Date(ms).getUTCDay() !== window.weekday) return false;
  if (window.repeatWeeks === 1) return true;
  const anchor = dateMs(window.anchorDate!);
  if (anchor === null || ms < anchor) return false;
  return ((ms - anchor) / DAY_MS) % 14 === 0;
}
