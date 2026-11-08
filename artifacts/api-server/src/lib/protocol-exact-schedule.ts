/** Date-only arithmetic: no current clock and no implicit server timezone. */
export interface ExactScheduleItem {
  substanceId: number;
  dose: string;
  totalSessions: number;
  intervalDays: number;
  startDate?: string | null;
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
