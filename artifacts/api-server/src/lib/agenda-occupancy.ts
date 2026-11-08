import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { projectImportedCommitment, type ImportedCommitment } from "./agenda-google-projection";

export type AgendaExecutor = Pick<typeof db, "execute" | "select" | "insert" | "update">;
export async function loadAgendaOccupancy(
  resource: { id: number; professionalId: number | null; locationId: number | null },
  date: string, executor: AgendaExecutor = db, ignoreSessionId?: number,
) {
  const start = new Date(`${date}T00:00:00-03:00`);
  const end = new Date(start.getTime() + 86400_000);
  const sources = await executor.execute(sql`
    SELECT DISTINCT l.id,l.google_calendar_id FROM locations l
    JOIN locations target ON target.id=${resource.locationId}
    WHERE l.empresa_id=target.empresa_id AND l.active='true' AND (
      l.id=${resource.locationId}
      OR EXISTS(SELECT 1 FROM agenda_personal_owners p WHERE p.location_id=l.id
        AND p.empresa_id=l.empresa_id AND p.professional_id=${resource.professionalId})
      OR (${resource.professionalId}::int IS NOT NULL AND EXISTS(SELECT 1 FROM agenda_resources r
        WHERE r.location_id=l.id AND r.active AND r.professional_id=${resource.professionalId}))
    )`);
  const ids = sources.rows.map((r) => Number(r.id));
  // Drizzle expande um array JavaScript em lista SQL. Para ANY precisamos
  // de um único parâmetro PostgreSQL, não de uma lista de parâmetros.
  const sourceIds = `{${ids.join(",")}}`;
  const blockedRanges: {start: number; end: number}[] = [];
  const occupiedRanges: {start: number; end: number}[] = [];
  let fresh = true;
  if (ids.length) {
    const freshness = await executor.execute(sql`SELECT count(*)::int AS expected,
      count(*) FILTER(WHERE last_success > now()-interval '5 minutes' AND error IS NULL)::int AS fresh
      FROM agenda_google_sync WHERE enabled AND location_id=ANY(${sourceIds}::int[])`);
    fresh = Number(freshness.rows[0]?.expected) === sources.rows.filter((s) => s.google_calendar_id).length
      && Number(freshness.rows[0]?.fresh) === Number(freshness.rows[0]?.expected);
    const events = await executor.execute(sql`
      SELECT c.id,c.titulo,c.inicio,c.fim,c.dia_inteiro AS "diaInteiro",c.recorrencia,c.origem,
        l.name AS agenda,l.color AS cor,l.agenda_papel AS papel
      FROM agenda_compromissos c JOIN locations l ON l.id=c.location_id
      WHERE c.status='ativo' AND c.location_id=ANY(${sourceIds}::int[]) AND
        ((c.inicio<${end.toISOString()}::timestamptz AND c.fim>${start.toISOString()}::timestamptz) OR c.origem='google_recorrente')
        AND NOT EXISTS(SELECT 1 FROM sessions s WHERE NOT s.agenda_archived AND s.google_event_id IS NOT NULL
          AND c.chave='google:'||s.google_event_id AND s.google_calendar_id=c.google_calendar_id)`);
    for (const row of events.rows) for (const event of projectImportedCommitment(row as unknown as ImportedCommitment, start, end)) {
      blockedRanges.push({
        start: Math.max(0, (Date.parse(event.inicio) - start.getTime()) / 60000),
        end: Math.min(1440, (Date.parse(event.fim) - start.getTime()) / 60000),
      });
    }
  }
  const sessions = await executor.execute(sql`
    SELECT s.resource_id,s.scheduled_time,coalesce(s.duration_minutes,r.slot_minutes,30) AS duration FROM sessions s
    JOIN agenda_resources r ON r.id=s.resource_id
    JOIN locations l ON l.id=r.location_id JOIN locations target ON target.id=${resource.locationId}
    WHERE l.empresa_id=target.empresa_id AND s.scheduled_date=${date}
      AND s.status IN ('scheduled','confirmed','completed') AND NOT s.agenda_archived
      AND (${ignoreSessionId ?? null}::int IS NULL OR s.id<>${ignoreSessionId ?? null})
      AND (r.id=${resource.id} OR (${resource.professionalId}::int IS NOT NULL AND r.professional_id=${resource.professionalId}))`);
  for (const session of sessions.rows) {
    const [h,m] = String(session.scheduled_time).split(":").map(Number);
    const range = { start: h*60+m, end: h*60+m+Number(session.duration) };
    (Number(session.resource_id) === resource.id ? occupiedRanges : blockedRanges).push(range);
  }
  return { blockedRanges, occupiedRanges, fresh };
}
