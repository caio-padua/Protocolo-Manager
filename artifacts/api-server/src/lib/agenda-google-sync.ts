import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getUncachableGoogleCalendarClient, verifyClinicAccount } from "./google-calendar";
import { normalizeGoogleSource, scopedGoogleSource, type SourceEvent } from "./agenda-google-source";
import { logger } from "./logger";

let running: Promise<void> | undefined;
/** Interface estreita, somente leitura. Provedor sintético pode testar paginação sem rede. */
export async function readGooglePages(
  read: (query: { pageToken?: string; syncToken?: string }) => Promise<{
    items?: SourceEvent[] | null; nextPageToken?: string | null; nextSyncToken?: string | null;
  }>,
  cursor?: string | null,
) {
  const events: SourceEvent[] = [];
  let pageToken: string | undefined, nextCursor: string | null = null;
  const seen = new Set<string>();
  do {
    const page = await read({ pageToken, syncToken: cursor ?? undefined });
    events.push(...(page.items ?? []));
    pageToken = page.nextPageToken ?? undefined;
    nextCursor = page.nextSyncToken ?? nextCursor;
    if (pageToken && seen.has(pageToken)) throw new Error("Paginação repetida");
    if (pageToken) seen.add(pageToken);
  } while (pageToken);
  if (!nextCursor) throw new Error("Origem não devolveu marcador de sincronização");
  return { events, nextCursor };
}

async function runSync() {
  const locations = await db.execute(sql`
    SELECT l.id,l.empresa_id,l.google_calendar_id FROM locations l
    JOIN agenda_google_sync s ON s.location_id=l.id
    WHERE s.enabled AND l.active='true' AND l.google_calendar_id IS NOT NULL
    ORDER BY l.id`);
  if (!locations.rows.length) return;
  try {
    const account = await verifyClinicAccount();
    if (!account.ok) throw new Error("Conta Google não confirmada");
  } catch {
    await db.execute(sql`UPDATE agenda_google_sync SET last_attempt=now(),error='Conta Google não confirmada; reconecte a integração.' WHERE enabled`);
    return;
  }
  const calendar = await getUncachableGoogleCalendarClient();
  for (const location of locations.rows) {
    const id = Number(location.id);
    try {
      await db.transaction(async (tx) => {
        const lock = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(19872027,${id}) AS acquired`);
        if (!lock.rows[0]?.acquired) return;
        const state = await tx.execute(sql`SELECT cursor,source_calendar_id FROM agenda_google_sync WHERE location_id=${id} AND enabled`);
        if (!state.rows.length) return;
        const load = (cursor: string | null) => readGooglePages(async (query) => {
          const response = await calendar.events.list({
            calendarId: String(location.google_calendar_id), ...query,
              singleEvents: false, showDeleted: true, maxResults: 2500,
          }, { timeout: 30_000 });
          return response.data as Awaited<ReturnType<Parameters<typeof readGooglePages>[0]>>;
        }, cursor);
        const cursor = state.rows[0].source_calendar_id === location.google_calendar_id
          ? state.rows[0].cursor as string | null : null;
        let full = !cursor;
        let batch;
        try { batch = await load(cursor); }
        catch (error: any) {
          if (error?.code !== 410 && error?.response?.status !== 410) throw error;
          full = true;
          batch = await load(null);
        }
        await tx.execute(sql`SELECT pg_advisory_xact_lock(19872026,${Number(location.empresa_id)})`);
        // Conferir novamente vínculo e ativação após a leitura externa.
        const current = await tx.execute(sql`SELECT 1 FROM locations l JOIN agenda_google_sync s ON s.location_id=l.id
          WHERE l.id=${id} AND l.google_calendar_id=${String(location.google_calendar_id)} AND s.enabled`);
        if (!current.rows.length) throw new Error("Vínculo mudou durante a atualização");
        if (!full && batch.events.length === 0) {
          await tx.execute(sql`UPDATE agenda_google_sync SET cursor=${batch.nextCursor},last_success=now(),
            last_attempt=now(),error=NULL WHERE location_id=${id}`);
          return;
        }
        if (full) await tx.execute(sql`UPDATE agenda_google_source
          SET body=jsonb_set(body,'{status}','"cancelled"'::jsonb) WHERE location_id=${id}`);
        for (const raw of batch.events) {
          if (!raw.id) throw new Error("Evento sem identidade na origem");
          const event = scopedGoogleSource(raw);
          await tx.execute(sql`INSERT INTO agenda_google_source(location_id,event_id,body)
            VALUES(${id},${event.id},${JSON.stringify(event)}::jsonb)
            ON CONFLICT(location_id,event_id) DO UPDATE SET body=EXCLUDED.body`);
        }
        const source = await tx.execute(sql`SELECT body FROM agenda_google_source WHERE location_id=${id}`);
        const bodies = source.rows.map((r) => r.body as SourceEvent);
        for (const raw of bodies) {
          const scoped = scopedGoogleSource(raw);
          if (scoped !== raw && Object.keys(raw).some((key) =>
            !["id","status","recurringEventId","originalStartTime"].includes(key))) await tx.execute(sql`UPDATE agenda_google_source SET body=${JSON.stringify(scoped)}::jsonb
            WHERE location_id=${id} AND event_id=${raw.id!}`);
        }
        const events = normalizeGoogleSource(bodies.map(scopedGoogleSource));
        await tx.execute(sql`UPDATE agenda_compromissos SET status='cancelado' WHERE location_id=${id}
          AND origem IN ('google','google_recorrente')`);
        for (const event of events) {
          await tx.execute(sql`INSERT INTO agenda_compromissos
            (location_id,google_calendar_id,chave,ical_uid,titulo,descricao,local_texto,inicio,fim,dia_inteiro,recorrencia,status,origem)
            VALUES(${id},${String(location.google_calendar_id)},${`google:${event.eventId}`},${event.icalUid},
              ${event.titulo},${event.descricao},${event.localTexto},${event.inicio}::timestamptz,${event.fim}::timestamptz,
              ${event.diaInteiro},${event.recorrencia},'ativo',${event.origem})
            ON CONFLICT(location_id,chave) DO UPDATE SET
              titulo=EXCLUDED.titulo,descricao=EXCLUDED.descricao,local_texto=EXCLUDED.local_texto,
              inicio=EXCLUDED.inicio,fim=EXCLUDED.fim,dia_inteiro=EXCLUDED.dia_inteiro,
              recorrencia=EXCLUDED.recorrencia,status='ativo',origem=EXCLUDED.origem`);
        }
        await tx.execute(sql`UPDATE agenda_google_sync SET cursor=${batch.nextCursor},source_calendar_id=${String(location.google_calendar_id)},last_success=now(),
          last_attempt=now(),error=NULL WHERE location_id=${id}`);
        logger.info({ locationId: id, events: events.length, full }, "Agenda: atualização somente leitura concluída");
      });
    } catch {
      // Nunca guardar payload, título ou resposta do provedor no erro público.
      await db.execute(sql`UPDATE agenda_google_sync SET last_attempt=now(),error='Falha ao atualizar o Google; os dados anteriores foram preservados.' WHERE location_id=${id}`);
      logger.warn({ locationId: id }, "Agenda: atualização falhou, estado anterior preservado");
    }
  }
}

export function syncGoogleAgenda() {
  // A leitura de agendas sem local roda depois da leitura por local, no mesmo ciclo e com a mesma trava de execução.
  if (!running) {
    running = runSync()
      .then(async () => {
        const { runSyncRecursos } = await import("./agenda-google-sync-recursos");
        await runSyncRecursos();
      })
      .finally(() => { running = undefined; });
  }
  return running;
}
export function startGoogleAgendaSync() {
  const run = () => void syncGoogleAgenda().catch(() => logger.warn("Agenda: integração Google indisponível"));
  run();
  const timer = setInterval(run, 60_000);
  timer.unref();
}
