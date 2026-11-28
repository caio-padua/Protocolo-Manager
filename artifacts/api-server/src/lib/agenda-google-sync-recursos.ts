import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getUncachableGoogleCalendarClient, verifyClinicAccount } from "./google-calendar";
import { normalizeGoogleSource, scopedGoogleSource, type SourceEvent } from "./agenda-google-source";
import { readGooglePages } from "./agenda-google-sync";
import { logger } from "./logger";

/**
 * Leitura (SOMENTE LEITURA) do Google para agendas que NÃO têm registro de local (ex.: Home Care, Outro local de
 * enfermagem). Mesma lógica da leitura por local, com a própria agenda como chave: nenhum local falso é criado e
 * nenhuma tabela da leitura por local é tocada. Nunca escreve no Google.
 *
 * Só entram agendas ativas, com calendário Google ligado, sem local e cujo calendário NÃO seja o de algum local
 * (esse caso já é lido pela leitura por local; ler duas vezes duplicaria compromissos).
 */
const CHAVE_BLOQUEIO_RECURSO = 19872028;
const CHAVE_BLOQUEIO_EMPRESA = 19872026;

export async function agendasSemLocalParaLer() {
  const { rows } = await db.execute(sql`
    SELECT r.id, r.empresa_id, r.google_calendar_id FROM agenda_resources r
    WHERE r.active AND r.location_id IS NULL AND r.empresa_id IS NOT NULL AND r.google_calendar_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM locations l WHERE l.google_calendar_id = r.google_calendar_id)
    ORDER BY r.id`);
  return rows.map((r: any) => ({ id: Number(r.id), empresaId: Number(r.empresa_id), calendarId: String(r.google_calendar_id) }));
}

type Cliente = Awaited<ReturnType<typeof getUncachableGoogleCalendarClient>>;

export async function lerAgendaSemLocal(
  agenda: { id: number; empresaId: number; calendarId: string }, calendar: Pick<Cliente, "events">,
) {
  const { id, calendarId } = agenda;
  await db.transaction(async (tx) => {
    const lock = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(${CHAVE_BLOQUEIO_RECURSO},${id}) AS acquired`);
    if (!lock.rows[0]?.acquired) return;
    await tx.execute(sql`INSERT INTO agenda_google_sync_recurso(recurso_id) VALUES(${id}) ON CONFLICT(recurso_id) DO NOTHING`);
    const state = await tx.execute(sql`SELECT cursor,source_calendar_id FROM agenda_google_sync_recurso WHERE recurso_id=${id} AND enabled`);
    if (!state.rows.length) return;
    const load = (cursor: string | null) => readGooglePages(async (query) => {
      const response = await calendar.events.list({
        calendarId, ...query, singleEvents: false, showDeleted: true, maxResults: 2500,
      }, { timeout: 30_000 });
      return response.data as Awaited<ReturnType<Parameters<typeof readGooglePages>[0]>>;
    }, cursor);
    const cursor = state.rows[0].source_calendar_id === calendarId ? state.rows[0].cursor as string | null : null;
    let full = !cursor;
    let batch;
    try { batch = await load(cursor); }
    catch (error: any) {
      if (error?.code !== 410 && error?.response?.status !== 410) throw error;
      full = true;
      batch = await load(null);
    }
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${CHAVE_BLOQUEIO_EMPRESA},${agenda.empresaId})`);
    // Conferir de novo vínculo e ativação depois da leitura externa.
    const current = await tx.execute(sql`SELECT 1 FROM agenda_resources r WHERE r.id=${id} AND r.active
      AND r.location_id IS NULL AND r.google_calendar_id=${calendarId}`);
    if (!current.rows.length) throw new Error("Vínculo mudou durante a atualização");
    if (!full && batch.events.length === 0) {
      await tx.execute(sql`UPDATE agenda_google_sync_recurso SET cursor=${batch.nextCursor},last_success=now(),
        last_attempt=now(),error=NULL WHERE recurso_id=${id}`);
      return;
    }
    if (full) await tx.execute(sql`UPDATE agenda_google_source_recurso
      SET body=jsonb_set(body,'{status}','"cancelled"'::jsonb) WHERE recurso_id=${id}`);
    for (const raw of batch.events) {
      if (!raw.id) throw new Error("Evento sem identidade na origem");
      const event = scopedGoogleSource(raw);
      await tx.execute(sql`INSERT INTO agenda_google_source_recurso(recurso_id,event_id,body)
        VALUES(${id},${event.id},${JSON.stringify(event)}::jsonb)
        ON CONFLICT(recurso_id,event_id) DO UPDATE SET body=EXCLUDED.body`);
    }
    const source = await tx.execute(sql`SELECT body FROM agenda_google_source_recurso WHERE recurso_id=${id}`);
    const bodies = source.rows.map((r) => r.body as SourceEvent);
    for (const raw of bodies) {
      const scoped = scopedGoogleSource(raw);
      if (scoped !== raw && Object.keys(raw).some((key) =>
        !["id", "status", "recurringEventId", "originalStartTime"].includes(key))) {
        await tx.execute(sql`UPDATE agenda_google_source_recurso SET body=${JSON.stringify(scoped)}::jsonb
          WHERE recurso_id=${id} AND event_id=${raw.id!}`);
      }
    }
    const events = normalizeGoogleSource(bodies.map(scopedGoogleSource));
    await tx.execute(sql`UPDATE agenda_compromissos_recurso SET status='cancelado' WHERE recurso_id=${id}
      AND origem IN ('google','google_recorrente')`);
    for (const event of events) {
      await tx.execute(sql`INSERT INTO agenda_compromissos_recurso
        (recurso_id,google_calendar_id,chave,ical_uid,titulo,descricao,local_texto,inicio,fim,dia_inteiro,recorrencia,status,origem)
        VALUES(${id},${calendarId},${`google:${event.eventId}`},${event.icalUid},
          ${event.titulo},${event.descricao},${event.localTexto},${event.inicio}::timestamptz,${event.fim}::timestamptz,
          ${event.diaInteiro},${event.recorrencia},'ativo',${event.origem})
        ON CONFLICT(recurso_id,chave) DO UPDATE SET
          titulo=EXCLUDED.titulo,descricao=EXCLUDED.descricao,local_texto=EXCLUDED.local_texto,
          inicio=EXCLUDED.inicio,fim=EXCLUDED.fim,dia_inteiro=EXCLUDED.dia_inteiro,
          recorrencia=EXCLUDED.recorrencia,status='ativo',origem=EXCLUDED.origem`);
    }
    await tx.execute(sql`UPDATE agenda_google_sync_recurso SET cursor=${batch.nextCursor},source_calendar_id=${calendarId},
      last_success=now(),last_attempt=now(),error=NULL WHERE recurso_id=${id}`);
    logger.info({ agendaId: id, events: events.length, full }, "Agenda sem local: atualização somente leitura concluída");
  });
}

export async function runSyncRecursos() {
  const agendas = await agendasSemLocalParaLer();
  if (!agendas.length) return;
  try {
    const account = await verifyClinicAccount();
    if (!account.ok) throw new Error("Conta Google não confirmada");
  } catch {
    await db.execute(sql`UPDATE agenda_google_sync_recurso SET last_attempt=now(),
      error='Conta Google não confirmada; reconecte a integração.' WHERE enabled`);
    return;
  }
  const calendar = await getUncachableGoogleCalendarClient();
  for (const agenda of agendas) {
    try {
      await lerAgendaSemLocal(agenda, calendar);
    } catch {
      // Nunca guardar payload, título ou resposta do provedor no erro público.
      await db.execute(sql`INSERT INTO agenda_google_sync_recurso(recurso_id,last_attempt,error)
        VALUES(${agenda.id},now(),'Falha ao atualizar o Google; os dados anteriores foram preservados.')
        ON CONFLICT(recurso_id) DO UPDATE SET last_attempt=now(),
          error='Falha ao atualizar o Google; os dados anteriores foram preservados.'`);
      logger.warn({ agendaId: agenda.id }, "Agenda sem local: atualização falhou, estado anterior preservado");
    }
  }
}
