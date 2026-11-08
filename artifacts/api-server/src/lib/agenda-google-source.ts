import { GOOGLE_AGENDA_FLOOR, googleRecurrenceRule, type GoogleRecurrence } from "./agenda-google-projection";

type EventTime = { date?: string | null; dateTime?: string | null; timeZone?: string | null };
export interface SourceEvent {
  id?: string | null; status?: string | null; summary?: string | null;
  description?: string | null; location?: string | null; iCalUID?: string | null;
  start?: EventTime; end?: EventTime; recurrence?: string[] | null;
  recurringEventId?: string | null; originalStartTime?: EventTime;
}
export function googleInstant(time?: EventTime) {
  if (time?.dateTime) return new Date(time.dateTime).toISOString();
  if (time?.date) return new Date(`${time.date}T00:00:00-03:00`).toISOString();
  throw new Error("Compromisso da origem sem horário");
}
export function scopedGoogleSource(event: SourceEvent): SourceEvent {
  const outside = !event.recurrence?.length && event.start
    && Date.parse(googleInstant(event.start)) < Date.parse(`${GOOGLE_AGENDA_FLOOR}T00:00:00-03:00`);
  if (event.status !== "cancelled" && !outside) return event;
  // Tombstone mínimo para deltas/ocorrências: histórico fora do corte não
  // conserva título, descrição, endereço, contato ou convidados no cache.
  return {id:event.id,status:"cancelled",...(event.recurringEventId ? {
    recurringEventId:event.recurringEventId,originalStartTime:event.originalStartTime,
  } : {})};
}

/** Uma linha por original/override. Nenhum título é interpretado como cliente. */
export function normalizeGoogleSource(events: SourceEvent[]) {
  const floor = new Date(`${GOOGLE_AGENDA_FLOOR}T00:00:00-03:00`);
  const byId = new Map(events.map((e) => [e.id, e]));
  const overrides = new Map<string, SourceEvent[]>();
  for (const event of events) if (event.recurringEventId) {
    overrides.set(event.recurringEventId, [...(overrides.get(event.recurringEventId) ?? []), event]);
  }
  const rows = [];
  for (const event of events) {
    if (!event.id || event.status === "cancelled") continue;
    if (event.recurringEventId && byId.get(event.recurringEventId)?.status === "cancelled") continue;
    const originalStart = googleInstant(event.start);
    // O histórico está fora do escopo. Não validar duração de evento antigo
    // simples, nem deixar inconsistência histórica impedir a agenda atual.
    if (!event.recurrence?.length && Date.parse(originalStart) < floor.getTime()) continue;
    const end = googleInstant(event.end);
    const duration = Date.parse(end) - Date.parse(originalStart);
    let inicio = originalStart;
    let recorrencia: string | null = null;
    if (event.recurrence?.length) {
      const data: GoogleRecurrence = {
        version: 1, start: originalStart, end, lines: event.recurrence,
        excluded: (overrides.get(event.id) ?? []).map((e) => googleInstant(e.originalStartTime)),
        timezone: event.start?.timeZone ?? "America/Sao_Paulo",
      };
      const rule = googleRecurrenceRule(data);
      const excluded = new Set(data.excluded);
      let first = rule.after(floor, true);
      while (first && excluded.has(first.toISOString())) first = rule.after(first, false);
      if (!first) continue;
      inicio = first.toISOString();
      recorrencia = JSON.stringify(data);
    }
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("Duração inválida na origem");
    rows.push({
      eventId: event.id, icalUid: event.iCalUID ?? `${event.id}@google.com`,
      titulo: event.summary ?? "Sem título", descricao: event.description ?? null,
      localTexto: event.location ?? null, inicio,
      fim: new Date(Date.parse(inicio) + duration).toISOString(),
      diaInteiro: Boolean(event.start?.date), recorrencia,
      origem: recorrencia ? "google_recorrente" : "google",
    });
  }
  return rows;
}
