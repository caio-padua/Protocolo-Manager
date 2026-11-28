/**
 * K10 — aviso imediato ao cliente quando a visita fecha com aplicação registrada.
 *
 * A reserva única ocorre depois do commit clínico e antes de qualquer canal.
 * Resultado reservado não expira nem é reenviado automaticamente: uma queda pode
 * ocorrer depois de o provedor aceitar a mensagem, mas antes de gravarmos o retorno.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";
import { realNoticeChannels } from "./visit-confirmation-channels";
import { sendDocToClient, type ChannelReport, type ChannelSenders } from "./visit-confirmation";
import { applicationDoneMessage, whenLabel } from "./visit-confirmation-messages";
import { blocoTabelaSubstancias, type ItemTabelaSubstancia } from "./messaging/substance-table";
import type { PaxterDoc } from "./messaging/types";

interface NoticeContext {
  session_id: number;
  empresa_id: number | null;
  client_id: number;
  protocol_id: number;
  status: string;
  agenda_archived: boolean;
  scheduled_date: string;
  scheduled_time: string;
  client_empresa_id: number;
  client_status: string;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  telegram_chat_id: string | null;
  protocol_empresa_id: number | null;
  protocol_client_id: number;
}

interface ApplicationRow {
  substance_id: number;
  substance_name: string | null;
  dose: string;
  session_number: number;
  total_sessions: number;
  status: string;
  availability: string;
  substance_color: string | null;
}

interface NoticeSummary {
  state: "reservado" | "enviado" | "nao_enviado";
  reserved_at: Date | string;
  finished_at: Date | string | null;
  applied_count: number;
  due_count: number;
  channels: ChannelReport[];
}

const inFlight = new Set<Promise<void>>();

async function rowsOf<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  const result = await db.execute(query);
  return (result as unknown as { rows: T[] }).rows;
}

function asNumber(value: number | string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildItems(rows: ApplicationRow[]): ItemTabelaSubstancia[] {
  return rows.filter((row) => row.availability === "disp").map((row) => ({
    nome: row.substance_name?.trim() || `Substância não cadastrada (${row.substance_id})`,
    dose: row.dose,
    sessao: `${row.session_number}/${row.total_sessions}`,
    status: row.status === "applied" ? "applied" : "notApplied",
    cor: row.substance_color ?? undefined,
  }));
}

async function sendApplicationNotice(sessionId: number, empresaId: number, channels: ChannelSenders): Promise<void> {
  let reserved = false;
  try {
    const [ctx] = await rowsOf<NoticeContext>(sql`
      SELECT s.id AS session_id, s.empresa_id, s.client_id, s.protocol_id, s.status, s.agenda_archived,
             s.scheduled_date, s.scheduled_time,
             c.empresa_id AS client_empresa_id, c.status AS client_status, c.name AS client_name,
             c.email AS client_email, c.phone AS client_phone, c.telegram_chat_id,
             p.empresa_id AS protocol_empresa_id, p.client_id AS protocol_client_id
        FROM sessions s
        JOIN clients c ON c.id = s.client_id
        JOIN protocols p ON p.id = s.protocol_id
       WHERE s.id = ${sessionId}
       LIMIT 1`);

    // Não enviar diante de vínculo ausente, cliente inativo, arquivo ou empresa inconsistente.
    if (!ctx || ctx.status !== "completed" || ctx.agenda_archived ||
        ctx.empresa_id !== empresaId || ctx.client_empresa_id !== empresaId ||
        ctx.client_status !== "active" || ctx.protocol_empresa_id !== empresaId ||
        ctx.protocol_client_id !== ctx.client_id) {
      logger.warn({ sessionId, empresaId }, "[visit-application-notice] sessão fora do escopo; aviso não enviado");
      return;
    }

    const apps = await rowsOf<ApplicationRow>(sql`
      SELECT a.substance_id, sub.name AS substance_name, a.dose, a.session_number, a.total_sessions,
             a.status, a.availability, sub.color AS substance_color
        FROM substance_applications a
        LEFT JOIN substances sub ON sub.id = a.substance_id
       WHERE a.session_id = ${sessionId}
       ORDER BY a.id`);
    const dueRows = apps.filter((item) => item.availability === "disp");
    const appliedCount = dueRows.filter((item) => item.status === "applied").length;
    const dueCount = dueRows.length;
    if (appliedCount < 1 || dueCount < 1 || appliedCount > dueCount) return;

    const [claim] = await rowsOf<{ id: number }>(sql`
      INSERT INTO visit_application_notices
        (session_id, empresa_id, client_id, state, applied_count, due_count)
      VALUES (${sessionId}, ${empresaId}, ${ctx.client_id}, 'reservado', ${appliedCount}, ${dueCount})
      ON CONFLICT (session_id) DO NOTHING
      RETURNING id`);
    if (!claim) return;
    reserved = true;

    const dueItems = buildItems(dueRows);
    const html = blocoTabelaSubstancias(dueItems);
    const doc: PaxterDoc = applicationDoneMessage({
      clientName: ctx.client_name ?? "",
      when: whenLabel(ctx.scheduled_date, ctx.scheduled_time),
      applied: appliedCount,
      due: dueCount,
      blocosHtml: html ? [html] : undefined,
    });
    const visitContext = {
      sessionId, empresaId, status: ctx.status, archived: ctx.agenda_archived,
      scheduledDate: ctx.scheduled_date, scheduledTime: ctx.scheduled_time,
      clientId: ctx.client_id, clientName: ctx.client_name ?? "",
      clientEmail: ctx.client_email?.trim() || null,
      clientPhone: ctx.client_phone?.trim() || null,
      telegramChatId: ctx.telegram_chat_id?.trim() || null,
      locationId: null, cpf: null, birthDate: null, address: null,
    };
    const report = await sendDocToClient(channels, visitContext, doc);
    const accepted = report.some((channel) => channel.estado === "aceito");
    await db.execute(sql`
      UPDATE visit_application_notices
         SET state = ${accepted ? "enviado" : "nao_enviado"},
             channels = ${JSON.stringify(report)}::jsonb,
             finished_at = now()
       WHERE id = ${claim.id} AND state = 'reservado'`);
    logger.info({ sessionId, state: accepted ? "enviado" : "nao_enviado" },
      "[visit-application-notice] processamento concluído");
  } catch (error) {
    logger.error({ err: (error as Error).message, sessionId }, "[visit-application-notice] falha no aviso");
    if (reserved) {
      try {
        await db.execute(sql`
          UPDATE visit_application_notices
             SET state = 'nao_enviado', finished_at = now()
           WHERE session_id = ${sessionId} AND state = 'reservado'`);
      } catch (persistError) {
        logger.error({ err: (persistError as Error).message, sessionId },
          "[visit-application-notice] falha ao gravar resultado do aviso");
      }
    }
  }
}

/**
 * Agenda o aviso sem atrasar a resposta clínica. Falhas não escapam para a rota;
 * testes podem chamar flushApplicationNotices para aguardar o trabalho pendente.
 */
export function queueApplicationNotice(
  sessionId: number, empresaId: number, channels: ChannelSenders = realNoticeChannels,
): void {
  const task = Promise.resolve().then(() => sendApplicationNotice(sessionId, empresaId, channels));
  inFlight.add(task);
  void task.finally(() => inFlight.delete(task));
}

export async function flushApplicationNotices(): Promise<void> {
  await Promise.all([...inFlight]);
}

export async function getApplicationNoticeSummary(
  sessionId: number, empresaId: number,
): Promise<{
  estado: NoticeSummary["state"]; em: string; finalizadoEm: string | null;
  aplicadas: number; previstas: number; canais: ChannelReport[];
} | null> {
  const [row] = await rowsOf<NoticeSummary>(sql`
    SELECT state, reserved_at, finished_at, applied_count, due_count, channels
      FROM visit_application_notices
     WHERE session_id = ${sessionId} AND empresa_id = ${empresaId}
     LIMIT 1`);
  if (!row) return null;
  const dateString = (value: Date | string | null) =>
    value ? new Date(value).toISOString() : null;
  return {
    estado: row.state,
    em: dateString(row.reserved_at)!,
    finalizadoEm: dateString(row.finished_at),
    aplicadas: asNumber(row.applied_count),
    previstas: asNumber(row.due_count),
    canais: Array.isArray(row.channels) ? row.channels : [],
  };
}
