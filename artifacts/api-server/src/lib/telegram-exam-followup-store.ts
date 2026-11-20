import { sql, type SQL } from "drizzle-orm";
import {
  examFollowupSchedule,
  isValidExamFollowupHours,
} from "./telegram-exam-followup-state";
import { getSetting } from "./secure-settings";

export interface ExamFollowupExecutor {
  execute(query: SQL): Promise<{ rows: unknown[] }>;
}

export interface ExamFollowupReservation {
  auditId: number;
  empresaId: number;
  clienteId: number;
  chatId: string;
  operationKey: string;
  intervalHours: number;
}

const ready = new WeakMap<object, Promise<void>>();

export function chaveIntervaloAcompanhamentoExame(empresaId: number): string {
  return `telegram.examFollowup.intervalHours.${empresaId}`;
}

export async function lerIntervaloAcompanhamentoExame(empresaId: number): Promise<number | null> {
  const raw = await getSetting(chaveIntervaloAcompanhamentoExame(empresaId));
  if (raw === "off" || raw === null) return null;
  const value = Number(raw);
  if (!isValidExamFollowupHours(value)) {
    throw new Error(`Configuração inválida de acompanhamento para a clínica ${empresaId}.`);
  }
  return value;
}

export function ensureTelegramExamFollowupsTable(exec: ExamFollowupExecutor): Promise<void> {
  const key = exec as object;
  const existing = ready.get(key);
  if (existing) return existing;
  const migration = (async () => {
    await exec.execute(sql`
      CREATE TABLE IF NOT EXISTS telegram_exam_followups (
        id BIGSERIAL PRIMARY KEY,
        source_dispatch_audit_id BIGINT NOT NULL UNIQUE,
        empresa_id INTEGER NOT NULL,
        cliente_id INTEGER NOT NULL,
        chat_id TEXT NOT NULL,
        operation_key TEXT NOT NULL,
        interval_hours SMALLINT NOT NULL CHECK (interval_hours BETWEEN 1 AND 72),
        provider_accepted_at TIMESTAMPTZ,
        receipt_due_at TIMESTAMPTZ,
        booking_due_at TIMESTAMPTZ,
        state TEXT NOT NULL DEFAULT 'awaiting_dispatch'
          CHECK (state IN (
            'awaiting_dispatch', 'receipt_pending', 'receipt_sending', 'receipt_waiting',
            'booking_pending', 'booking_sending', 'booking_waiting',
            'completed', 'closed', 'cancelled', 'needs_review'
          )),
        receipt_delivery_state TEXT NOT NULL DEFAULT 'not_sent'
          CHECK (receipt_delivery_state IN ('not_sent', 'sending', 'accepted', 'simulated', 'failed', 'unknown')),
        booking_delivery_state TEXT NOT NULL DEFAULT 'not_sent'
          CHECK (booking_delivery_state IN ('not_sent', 'sending', 'accepted', 'simulated', 'failed', 'unknown')),
        receipt_sent_at TIMESTAMPTZ,
        booking_sent_at TIMESTAMPTZ,
        receipt_answer TEXT CHECK (receipt_answer IN ('received', 'not_received', 'help', 'ambiguous')),
        booking_answer TEXT CHECK (booking_answer IN ('booked', 'not_booked', 'help', 'ambiguous')),
        receipt_reply_inbox_message_id BIGINT UNIQUE,
        booking_reply_inbox_message_id BIGINT UNIQUE,
        receipt_ack_state TEXT NOT NULL DEFAULT 'not_sent'
          CHECK (receipt_ack_state IN ('not_sent', 'sending', 'accepted', 'simulated', 'failed', 'unknown')),
        booking_ack_state TEXT NOT NULL DEFAULT 'not_sent'
          CHECK (booking_ack_state IN ('not_sent', 'sending', 'accepted', 'simulated', 'failed', 'unknown')),
        team_alert_state TEXT NOT NULL DEFAULT 'not_needed'
          CHECK (team_alert_state IN ('not_needed', 'sending', 'accepted', 'simulated', 'failed', 'unknown')),
        close_reason TEXT,
        closed_by INTEGER,
        error_code TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_at TIMESTAMPTZ
      )
    `);
    await exec.execute(sql`
      CREATE INDEX IF NOT EXISTS ix_telegram_exam_followups_due
      ON telegram_exam_followups (receipt_due_at, booking_due_at)
      WHERE state IN ('receipt_pending', 'receipt_waiting', 'booking_pending')
    `);
    await exec.execute(sql`
      CREATE INDEX IF NOT EXISTS ix_telegram_exam_followups_client_active
      ON telegram_exam_followups (empresa_id, cliente_id, chat_id, state)
      WHERE state IN ('receipt_waiting', 'booking_waiting')
    `);
  })().catch((error) => {
    ready.delete(key);
    throw error;
  });
  ready.set(key, migration);
  return migration;
}

export async function reservarAcompanhamentoExame(
  exec: ExamFollowupExecutor,
  input: ExamFollowupReservation,
): Promise<void> {
  if (!isValidExamFollowupHours(input.intervalHours) || !input.chatId.trim()) {
    throw new Error("Reserva de acompanhamento inválida.");
  }
  await ensureTelegramExamFollowupsTable(exec);
  await exec.execute(sql`
    INSERT INTO telegram_exam_followups
      (source_dispatch_audit_id, empresa_id, cliente_id, chat_id, operation_key, interval_hours)
    VALUES
      (${input.auditId}, ${input.empresaId}, ${input.clienteId}, ${input.chatId},
       ${input.operationKey}, ${input.intervalHours})
    ON CONFLICT (source_dispatch_audit_id) DO NOTHING
  `);
}

export async function ativarAcompanhamentoExame(
  exec: ExamFollowupExecutor,
  sourceAuditId: number,
  acceptedAt: Date,
  intervalHours: number,
): Promise<void> {
  if (!isValidExamFollowupHours(intervalHours)) throw new Error("Intervalo de acompanhamento inválido.");
  const { receiptDueAt, bookingDueAt } = examFollowupSchedule(acceptedAt, intervalHours);
  await exec.execute(sql`
    UPDATE telegram_exam_followups
    SET state = 'receipt_pending',
        provider_accepted_at = ${acceptedAt},
        receipt_due_at = ${receiptDueAt},
        booking_due_at = ${bookingDueAt},
        updated_at = NOW()
    WHERE source_dispatch_audit_id = ${sourceAuditId}
      AND state = 'awaiting_dispatch'
  `);
}

export async function encerrarReservaNaoAceita(
  exec: ExamFollowupExecutor,
  sourceAuditId: number,
): Promise<void> {
  await exec.execute(sql`
    UPDATE telegram_exam_followups
    SET state = 'cancelled', close_reason = 'dispatch_not_accepted',
        closed_at = NOW(), updated_at = NOW()
    WHERE source_dispatch_audit_id = ${sourceAuditId}
      AND state = 'awaiting_dispatch'
  `);
}

export async function marcarAcompanhamentoIncerto(
  exec: ExamFollowupExecutor,
  sourceAuditId: number,
  errorCode: string,
): Promise<void> {
  await exec.execute(sql`
    UPDATE telegram_exam_followups
    SET state = 'needs_review', error_code = ${errorCode}, updated_at = NOW()
    WHERE source_dispatch_audit_id = ${sourceAuditId}
      AND state NOT IN ('completed', 'closed', 'cancelled')
  `);
}

export async function cancelarAcompanhamentosDaClinica(
  exec: ExamFollowupExecutor,
  empresaId: number,
  reason: string,
): Promise<void> {
  await ensureTelegramExamFollowupsTable(exec);
  await exec.execute(sql`
    UPDATE telegram_exam_followups
    SET state = CASE WHEN state IN ('receipt_sending', 'booking_sending') THEN 'needs_review' ELSE 'cancelled' END,
        receipt_delivery_state = CASE WHEN state = 'receipt_sending' THEN 'unknown' ELSE receipt_delivery_state END,
        booking_delivery_state = CASE WHEN state = 'booking_sending' THEN 'unknown' ELSE booking_delivery_state END,
        close_reason = ${reason},
        error_code = CASE WHEN state IN ('receipt_sending', 'booking_sending') THEN ${`${reason}_during_send`} ELSE error_code END,
        closed_at = CASE WHEN state IN ('receipt_sending', 'booking_sending') THEN closed_at ELSE NOW() END,
        updated_at = NOW()
    WHERE empresa_id = ${empresaId}
      AND state NOT IN ('completed', 'closed', 'cancelled', 'needs_review')
  `);
}

export async function cancelarAcompanhamentosDoCliente(
  exec: ExamFollowupExecutor,
  clienteId: number,
  reason: string,
): Promise<void> {
  await ensureTelegramExamFollowupsTable(exec);
  await exec.execute(sql`
    UPDATE telegram_exam_followups
    SET state = CASE WHEN state IN ('receipt_sending', 'booking_sending') THEN 'needs_review' ELSE 'cancelled' END,
        receipt_delivery_state = CASE WHEN state = 'receipt_sending' THEN 'unknown' ELSE receipt_delivery_state END,
        booking_delivery_state = CASE WHEN state = 'booking_sending' THEN 'unknown' ELSE booking_delivery_state END,
        close_reason = ${reason},
        error_code = CASE WHEN state IN ('receipt_sending', 'booking_sending') THEN ${`${reason}_during_send`} ELSE error_code END,
        closed_at = CASE WHEN state IN ('receipt_sending', 'booking_sending') THEN closed_at ELSE NOW() END,
        updated_at = NOW()
    WHERE cliente_id = ${clienteId}
      AND state NOT IN ('completed', 'closed', 'cancelled', 'needs_review')
  `);
}

export async function encerrarAcompanhamentoExame(
  exec: ExamFollowupExecutor,
  input: { id: number; empresaId: number; clienteId: number; professionalId: number | null; reason: string },
): Promise<boolean> {
  await ensureTelegramExamFollowupsTable(exec);
  const result = await exec.execute(sql`
    UPDATE telegram_exam_followups
    SET state = 'closed', close_reason = ${input.reason},
        closed_by = ${input.professionalId}, closed_at = NOW(), updated_at = NOW()
    WHERE id = ${input.id}
      AND empresa_id = ${input.empresaId}
      AND cliente_id = ${input.clienteId}
      AND state NOT IN ('completed', 'closed', 'cancelled', 'awaiting_dispatch', 'receipt_sending', 'booking_sending')
    RETURNING id
  `);
  return result.rows.length > 0;
}

export async function listarAcompanhamentosExame(
  exec: ExamFollowupExecutor,
  input: { empresaId: number; clienteId: number },
): Promise<Array<Record<string, unknown>>> {
  await ensureTelegramExamFollowupsTable(exec);
  const result = await exec.execute(sql`
    SELECT id, state, interval_hours AS "intervalHours",
      provider_accepted_at AS "providerAcceptedAt",
      receipt_due_at AS "receiptDueAt", booking_due_at AS "bookingDueAt",
      receipt_sent_at AS "receiptSentAt", booking_sent_at AS "bookingSentAt",
      receipt_answer AS "receiptAnswer", booking_answer AS "bookingAnswer",
      receipt_delivery_state AS "receiptDeliveryState",
      booking_delivery_state AS "bookingDeliveryState",
      receipt_ack_state AS "receiptAckState", booking_ack_state AS "bookingAckState",
      team_alert_state AS "teamAlertState", close_reason AS "closeReason",
      (error_code IS NOT NULL) AS "requiresReview",
      created_at AS "createdAt", closed_at AS "closedAt"
    FROM telegram_exam_followups
    WHERE empresa_id = ${input.empresaId} AND cliente_id = ${input.clienteId}
      AND close_reason IS DISTINCT FROM 'dispatch_not_accepted'
    ORDER BY created_at DESC, id DESC
    LIMIT 30
  `);
  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    id: Number(row.id),
    intervalHours: Number(row.intervalHours),
  }));
}
