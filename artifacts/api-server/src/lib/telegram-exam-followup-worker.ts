import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { enviarMensagemPaxter } from "./messaging/engine.js";
import { baseUrlFromEnv } from "./messaging/base-url.js";
import type { PaxterDoc } from "./messaging/types.js";
import { getSetting } from "./secure-settings";
import { logger } from "./logger";
import { chatAlertaOuNull } from "./telegram-config";
import { sendTelegram } from "./telegram";
import { escaparHtmlTelegram } from "./orientacao-texto";
import { brtNow } from "./brt";
import { vinculoTelegramAtualUnico } from "./telegram-vinculo-atual";
import {
  classifyExamFollowupAnswer,
  type ExamFollowupIntent,
  type ExamFollowupStage,
} from "./telegram-exam-followup-state";
import {
  ativarAcompanhamentoExame,
  cancelarAcompanhamentosDoCliente,
  ensureTelegramExamFollowupsTable,
  encerrarReservaNaoAceita,
  type ExamFollowupExecutor,
  lerIntervaloAcompanhamentoExame,
  marcarAcompanhamentoIncerto,
} from "./telegram-exam-followup-store";

type FollowupRow = {
  id: number | string;
  source_dispatch_audit_id: number | string;
  empresa_id: number | string;
  cliente_id: number | string;
  chat_id: string;
  operation_key: string;
  interval_hours: number | string;
  state: string;
  stage: ExamFollowupStage;
};

type ReplyCandidate = {
  inbox_message_id: number | string;
  empresa_id: number | string;
  cliente_id: number | string;
  chat_id: string;
  texto: string;
  recebida_em: Date | string;
  followup_id: number | string;
  stage: ExamFollowupStage;
};

const ACTIVE_STATES = ["awaiting_dispatch", "receipt_pending", "receipt_sending",
  "receipt_waiting", "booking_pending", "booking_sending", "booking_waiting"] as const;

async function reconciliarReservasDeEnvio(): Promise<void> {
  const result = await db.execute(sql`
    SELECT f.id, f.source_dispatch_audit_id, f.interval_hours, f.created_at,
      a.detail, a.created_at AS audit_created_at
    FROM telegram_exam_followups f
    LEFT JOIN collaborator_audit a ON a.id = f.source_dispatch_audit_id
    WHERE f.state = 'awaiting_dispatch'
    ORDER BY f.id
    LIMIT 100
  `);
  for (const row of result.rows as Array<Record<string, unknown>>) {
    const audit = row.detail && typeof row.detail === "object"
      ? row.detail as Record<string, unknown>
      : null;
    const id = Number(row.source_dispatch_audit_id);
    if (!audit) {
      await marcarAcompanhamentoIncerto(db, id, "dispatch_audit_missing");
      continue;
    }
    const state = audit.state;
    if (state === "provider_accepted" &&
        Number(audit.acceptedMessages) === Number(audit.plannedMessages)) {
      const acceptedAt = typeof audit.providerAcceptedAt === "string"
        ? new Date(audit.providerAcceptedAt)
        : null;
      if (!acceptedAt || !Number.isFinite(acceptedAt.getTime())) {
        await marcarAcompanhamentoIncerto(db, id, "provider_acceptance_time_missing");
        continue;
      }
      await ativarAcompanhamentoExame(db, id, acceptedAt, Number(row.interval_hours));
      continue;
    }
    if (state === "failed" || state === "simulated") {
      await encerrarReservaNaoAceita(db, id);
      continue;
    }
    if (state === "unknown") {
      await marcarAcompanhamentoIncerto(db, id, "dispatch_outcome_uncertain");
      continue;
    }
    const auditCreatedAt = row.audit_created_at instanceof Date
      ? row.audit_created_at.getTime()
      : Date.parse(String(row.audit_created_at ?? ""));
    if (Number.isFinite(auditCreatedAt) && auditCreatedAt < brtNow().getTime() - 5 * 60 * 1000) {
      await marcarAcompanhamentoIncerto(db, id, "dispatch_did_not_reach_confirmed_state");
    }
  }
}

async function recuperarEnviosInterrompidos(): Promise<void> {
  await db.execute(sql`
    UPDATE telegram_exam_followups
    SET state = 'needs_review', receipt_delivery_state = 'unknown',
        error_code = 'receipt_send_interrupted', updated_at = NOW()
    WHERE state = 'receipt_sending' AND updated_at < NOW() - interval '5 minutes'
  `);
  await db.execute(sql`
    UPDATE telegram_exam_followups
    SET state = 'needs_review', booking_delivery_state = 'unknown',
        error_code = 'booking_send_interrupted', updated_at = NOW()
    WHERE state = 'booking_sending' AND updated_at < NOW() - interval '5 minutes'
  `);
  await db.execute(sql`
    UPDATE telegram_exam_followups
    SET receipt_ack_state = 'unknown', error_code = COALESCE(error_code, 'receipt_ack_interrupted'),
        updated_at = NOW()
    WHERE receipt_ack_state = 'sending' AND updated_at < NOW() - interval '5 minutes'
  `);
  await db.execute(sql`
    UPDATE telegram_exam_followups
    SET booking_ack_state = 'unknown', error_code = COALESCE(error_code, 'booking_ack_interrupted'),
        updated_at = NOW()
    WHERE booking_ack_state = 'sending' AND updated_at < NOW() - interval '5 minutes'
  `);
  await db.execute(sql`
    UPDATE telegram_exam_followups
    SET team_alert_state = 'unknown', error_code = COALESCE(error_code, 'team_alert_interrupted'),
        updated_at = NOW()
    WHERE team_alert_state = 'sending' AND updated_at < NOW() - interval '5 minutes'
  `);
  await db.execute(sql`
    UPDATE telegram_exam_followups
    SET state = 'needs_review', error_code = 'receipt_window_elapsed',
        updated_at = NOW()
    WHERE state = 'receipt_pending' AND receipt_sent_at IS NULL
      AND booking_due_at <= NOW()
  `);
}

async function claimDueStage(): Promise<FollowupRow | null> {
  const result = await db.execute(sql`
    WITH candidate AS (
      SELECT id, CASE
        WHEN state = 'receipt_pending' THEN 'receipt'
        ELSE 'booking'
      END AS stage
      FROM telegram_exam_followups
      WHERE (state = 'receipt_pending' AND receipt_due_at <= NOW())
         OR (state IN ('receipt_waiting', 'booking_pending') AND booking_due_at <= NOW())
      ORDER BY COALESCE(receipt_due_at, booking_due_at), id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE telegram_exam_followups f
    SET state = CASE WHEN candidate.stage = 'receipt' THEN 'receipt_sending' ELSE 'booking_sending' END,
        receipt_delivery_state = CASE WHEN candidate.stage = 'receipt' THEN 'sending' ELSE receipt_delivery_state END,
        booking_delivery_state = CASE WHEN candidate.stage = 'booking' THEN 'sending' ELSE booking_delivery_state END,
        updated_at = NOW()
    FROM candidate
    WHERE f.id = candidate.id
    RETURNING f.*, candidate.stage
  `);
  return (result.rows[0] as FollowupRow | undefined) ?? null;
}

async function bloquearAcompanhamento(
  row: FollowupRow,
  reason: string,
  finalState: "cancelled" | "needs_review" = "cancelled",
): Promise<void> {
  const closeReason = finalState === "cancelled"
    ? sql`close_reason = ${reason}`
    : sql`close_reason = close_reason`;
  const errorCode = finalState === "needs_review"
    ? sql`error_code = ${reason}`
    : sql`error_code = error_code`;
  await db.execute(sql`
    UPDATE telegram_exam_followups
    SET state = ${finalState}, ${closeReason}, ${errorCode},
        closed_at = CASE WHEN ${finalState === "cancelled"} THEN NOW() ELSE closed_at END,
        updated_at = NOW()
    WHERE id = ${Number(row.id)}
      AND state IN ('receipt_sending', 'booking_sending')
  `);
}

async function conferirAcompanhamento(row: FollowupRow): Promise<string | null> {
  const empresaId = Number(row.empresa_id);
  const clienteId = Number(row.cliente_id);
  const sourceAuditId = Number(row.source_dispatch_audit_id);
  if ((await lerIntervaloAcompanhamentoExame(empresaId)) === null) return "clinic_disabled";
  if ((await getSetting("telegram.active")) !== "true") {
    return "telegram_disabled";
  }
  const clinicResult = await db.execute(sql`
    SELECT id, ativa, status FROM empresas WHERE id = ${empresaId} LIMIT 2
  `);
  if (clinicResult.rows.length !== 1) return "clinic_scope_changed";
  const clinic = clinicResult.rows[0] as { ativa: boolean; status: string };
  if (!clinic.ativa || clinic.status !== "ATIVO") return "clinic_inactive";
  const clientResult = await db.execute(sql`
    SELECT id, nome, status, deleted_at, empresa_id, telegram_chat_id
    FROM clients
    WHERE id = ${clienteId} AND empresa_id = ${empresaId}
    LIMIT 2
  `);
  if (clientResult.rows.length !== 1) return "client_scope_changed";
  const client = clientResult.rows[0] as {
    id: number | string; nome: string; status: string; deleted_at: Date | null;
    empresa_id: number | string; telegram_chat_id: string | null;
  };
  if (client.status !== "active" || client.deleted_at ||
      client.telegram_chat_id !== row.chat_id) return "client_or_chat_changed";
  if (!await vinculoTelegramAtualUnico(db, { clienteId, empresaId, chatId: row.chat_id })) {
    return "telegram_link_not_unique";
  }
  const human = await db.execute(sql`
    SELECT modo FROM telegram_atendimento WHERE cliente_id = ${clienteId} LIMIT 1
  `);
  if ((human.rows[0] as { modo?: string } | undefined)?.modo === "humano") return "human_takeover";
  const docs = await db.execute(sql`
    SELECT a.detail->'documentIds' AS document_ids
    FROM collaborator_audit a
    WHERE a.id = ${sourceAuditId} AND a.action = 'exam_request_dispatch'
      AND a.detail->>'state' = 'provider_accepted'
      AND a.detail->>'clientId' = ${String(clienteId)}
      AND a.detail->>'empresaId' = ${String(empresaId)}
  `);
  const ids = (docs.rows[0] as { document_ids?: unknown } | undefined)?.document_ids;
  if (!Array.isArray(ids) || ids.length === 0 ||
      ids.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
    return "source_dispatch_unavailable";
  }
  const idList = ids.map((id) => Number(id));
  const documentResult = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM exam_request_pdfs
    WHERE client_id = ${clienteId} AND id IN (${sql.join(idList.map((id) => sql`${id}`), sql`, `)})
  `);
  const count = Number((documentResult.rows[0] as { count?: number | string } | undefined)?.count ?? 0);
  if (count !== idList.length) return "source_documents_unavailable";
  return null;
}

function followupDoc(stage: ExamFollowupStage): PaxterDoc {
  return {
    eyebrow: "Acompanhamento do pedido de exames",
    titulo: "Pedido de exames",
    assunto: "Acompanhamento do pedido de exames",
    paragrafos: stage === "receipt"
      ? [
          "Olá. Você recebeu o pedido de exames enviado pelo PaxMed?",
          "Responda somente “sim” ou “não”. Se precisar de ajuda, escreva “ajuda”.",
        ]
      : [
          "Você conseguiu agendar os exames do pedido enviado pelo PaxMed?",
          "Responda somente “sim” ou “não”. Se precisar de ajuda, escreva “ajuda”.",
        ],
  };
}

async function enviarPergunta(row: FollowupRow): Promise<void> {
  const stage = row.stage;
  const stateBeingSent = stage === "receipt" ? "receipt_sending" : "booking_sending";
  const reason = await conferirAcompanhamento(row);
  if (reason) {
    if (reason === "human_takeover") {
      await bloquearAcompanhamento(row, reason);
    } else {
      await bloquearAcompanhamento(row, reason);
    }
    return;
  }
  const result = await enviarMensagemPaxter(
    followupDoc(stage),
    { telegramChatId: row.chat_id },
    ["TELEGRAM"],
    {
      baseUrl: baseUrlFromEnv(),
      clienteId: Number(row.cliente_id),
      empresaId: Number(row.empresa_id),
      contexto: stage === "receipt" ? "exam_followup_receipt" : "exam_followup_booking",
    },
  );
  const outcome = result.resultados[0];
  const accepted = !!outcome?.sent && !outcome.mock && !outcome.skipped && outcome.via !== "mock";
  if (accepted) {
    await db.execute(sql`
      UPDATE telegram_exam_followups
      SET state = ${stage === "receipt" ? "receipt_waiting" : "booking_waiting"},
          ${stage === "receipt" ? sql`receipt_delivery_state` : sql`booking_delivery_state`} = 'accepted',
          ${stage === "receipt" ? sql`receipt_sent_at` : sql`booking_sent_at`} = ${brtNow()},
          error_code = NULL, updated_at = NOW()
      WHERE id = ${Number(row.id)} AND state = ${stateBeingSent}
    `);
    return;
  }
  const deliveryState = outcome?.mock ? "simulated"
    : outcome?.skipped ? "failed"
      : outcome?.error ? "unknown" : "unknown";
  await db.execute(sql`
    UPDATE telegram_exam_followups
    SET state = 'needs_review',
        ${stage === "receipt" ? sql`receipt_delivery_state` : sql`booking_delivery_state`} = ${deliveryState},
        error_code = ${outcome?.mock ? "telegram_simulated" : outcome?.skipped ? "telegram_skipped" : "telegram_not_confirmed"},
        updated_at = NOW()
    WHERE id = ${Number(row.id)} AND state = ${stateBeingSent}
  `);
}

async function processarEnviosVencidos(limit = 20): Promise<void> {
  for (let index = 0; index < limit; index++) {
    const row = await claimDueStage();
    if (!row) return;
    try {
      await enviarPergunta(row);
    } catch {
      // A falha depois da reserva pode significar que o Telegram recebeu a pergunta.
      // O estado "sending" vira "unknown" após cinco minutos e nunca é reenviado.
      logger.warn({ followupId: Number(row.id), stage: row.stage }, "[telegram] falha no acompanhamento de exames; conferência humana necessária");
    }
  }
}

function respostaAoCliente(stage: ExamFollowupStage, intent: ExamFollowupIntent, alertAccepted: boolean): string {
  if (stage === "receipt" && intent === "received") {
    return "Obrigado por confirmar. Vamos perguntar em quatro dias se você conseguiu agendar os exames.";
  }
  if (stage === "booking" && intent === "booked") {
    return "Obrigado por avisar. Registramos que você conseguiu agendar os exames.";
  }
  return alertAccepted
    ? "Obrigado por avisar. Encaminhei sua mensagem para a equipe. Não enviarei outras mensagens automáticas sobre este pedido."
    : "Obrigado por avisar. Registrei sua resposta para a equipe conferir. Não enviarei outras mensagens automáticas sobre este pedido.";
}

function exigeEquipe(stage: ExamFollowupStage, intent: ExamFollowupIntent): boolean {
  return stage === "receipt"
    ? intent !== "received"
    : intent !== "booked";
}

function desfechoResposta(stage: ExamFollowupStage, intent: ExamFollowupIntent): string {
  return `exam_followup_${stage}_${intent}`;
}

async function registrarMensagemComoTratada(
  tx: ExamFollowupExecutor,
  inboxMessageId: number,
  desfecho: string,
): Promise<boolean> {
  const result = await tx.execute(sql`
    INSERT INTO telegram_atendimento_respostas
      (inbox_message_id, desfecho, fechado_em, estado, atualizado_em)
    VALUES (${inboxMessageId}, ${desfecho}, NOW(), 'concluido', NOW())
    ON CONFLICT (inbox_message_id) DO UPDATE
    SET desfecho = EXCLUDED.desfecho, fechado_em = NOW(), estado = 'concluido',
        dono = NULL, atualizado_em = NOW()
    WHERE telegram_atendimento_respostas.estado IN ('pendente', 'falhou')
       OR (telegram_atendimento_respostas.estado = 'concluido'
           AND telegram_atendimento_respostas.desfecho = 'desligado_ou_fora_da_lista')
    RETURNING inbox_message_id
  `);
  return result.rows.length > 0;
}

async function marcarParaHumano(tx: ExamFollowupExecutor, clienteId: number, reason: string): Promise<void> {
  await tx.execute(sql`
    INSERT INTO telegram_atendimento (cliente_id, modo, motivo, alterado_por)
    VALUES (${clienteId}, 'humano', ${reason}, NULL)
    ON CONFLICT (cliente_id) DO UPDATE
    SET modo = 'humano', motivo = ${reason}, alterado_em = NOW(), alterado_por = NULL
  `);
  await cancelarAcompanhamentosDoCliente(tx, clienteId, "human_takeover");
}

type ProcessedReply = {
  followupId: number;
  clienteId: number;
  empresaId: number;
  chatId: string;
  stage: ExamFollowupStage;
  intent: ExamFollowupIntent;
  handoff: boolean;
};

async function processarResposta(
  candidate: ReplyCandidate,
): Promise<ProcessedReply | null> {
  const inboxMessageId = Number(candidate.inbox_message_id);
  const followupId = Number(candidate.followup_id);
  const clienteId = Number(candidate.cliente_id);
  const empresaId = Number(candidate.empresa_id);
  const intent = classifyExamFollowupAnswer(candidate.stage, candidate.texto);
  return db.transaction(async (tx) => {
    const locked = await tx.execute(sql`
      SELECT id, cliente_id, empresa_id, chat_id, state,
        receipt_reply_inbox_message_id, booking_reply_inbox_message_id
      FROM telegram_exam_followups
      WHERE id = ${followupId}
      FOR UPDATE
    `);
    const row = locked.rows[0] as {
      id: number | string; cliente_id: number | string; empresa_id: number | string;
      chat_id: string; state: string; receipt_reply_inbox_message_id: number | string | null;
      booking_reply_inbox_message_id: number | string | null;
    } | undefined;
    if (!row || Number(row.cliente_id) !== clienteId || Number(row.empresa_id) !== empresaId ||
        row.chat_id !== candidate.chat_id ||
        (candidate.stage === "receipt" && (row.state !== "receipt_waiting" || row.receipt_reply_inbox_message_id)) ||
        (candidate.stage === "booking" && (row.state !== "booking_waiting" || row.booking_reply_inbox_message_id))) {
      return null;
    }
    if (!await vinculoTelegramAtualUnico(tx, { clienteId, empresaId, chatId: candidate.chat_id })) {
      await tx.execute(sql`
        UPDATE telegram_exam_followups
        SET state = 'cancelled', close_reason = 'telegram_link_not_unique',
            closed_at = NOW(), updated_at = NOW()
        WHERE id = ${followupId}
      `);
      await registrarMensagemComoTratada(tx, inboxMessageId, "exam_followup_link_changed");
      return null;
    }
    const human = await tx.execute(sql`
      SELECT modo FROM telegram_atendimento WHERE cliente_id = ${clienteId} LIMIT 1
    `);
    if ((human.rows[0] as { modo?: string } | undefined)?.modo === "humano") {
      await tx.execute(sql`
        UPDATE telegram_exam_followups
        SET state = 'cancelled', close_reason = 'human_takeover',
            closed_at = NOW(), updated_at = NOW()
        WHERE id = ${followupId} AND state IN ('receipt_waiting', 'booking_waiting')
      `);
      await registrarMensagemComoTratada(tx, inboxMessageId, "exam_followup_human_takeover");
      return null;
    }
    if (!await registrarMensagemComoTratada(tx, inboxMessageId, desfechoResposta(candidate.stage, intent))) {
      await tx.execute(sql`
        UPDATE telegram_exam_followups
        SET state = 'needs_review', error_code = 'inbox_message_claimed_elsewhere',
            updated_at = NOW()
        WHERE id = ${followupId}
      `);
      await marcarParaHumano(tx, clienteId, "exam_followup_message_claim_conflict");
      return null;
    }

    const handoff = exigeEquipe(candidate.stage, intent);
    const nextState = candidate.stage === "receipt"
      ? handoff ? "needs_review" : "booking_pending"
      : handoff ? "needs_review" : "completed";
    const answerColumn = candidate.stage === "receipt" ? sql`receipt_answer` : sql`booking_answer`;
    const replyColumn = candidate.stage === "receipt"
      ? sql`receipt_reply_inbox_message_id`
      : sql`booking_reply_inbox_message_id`;
    const ackColumn = candidate.stage === "receipt" ? sql`receipt_ack_state` : sql`booking_ack_state`;
    await tx.execute(sql`
      UPDATE telegram_exam_followups
      SET state = ${nextState},
          ${answerColumn} = ${intent},
          ${replyColumn} = ${inboxMessageId},
          ${ackColumn} = 'sending',
          team_alert_state = ${handoff ? "sending" : "not_needed"},
          close_reason = CASE WHEN ${handoff} THEN ${`client_${intent}`} ELSE close_reason END,
          closed_at = CASE WHEN ${nextState} = 'completed' THEN NOW() ELSE closed_at END,
          updated_at = NOW()
      WHERE id = ${followupId}
    `);
    if (handoff) {
      await marcarParaHumano(tx, clienteId, `exam_followup_${intent}`);
      // The current case remains visible as needs_review; only other active cases are cancelled.
      await tx.execute(sql`
        UPDATE telegram_exam_followups
        SET state = 'needs_review', close_reason = ${`client_${intent}`}, updated_at = NOW()
        WHERE id = ${followupId}
      `);
    }
    return { followupId, clienteId, empresaId, chatId: candidate.chat_id,
      stage: candidate.stage, intent, handoff };
  });
}

async function enviarAlertaEquipe(p: ProcessedReply): Promise<boolean> {
  const chat = await chatAlertaOuNull();
  if (!chat) return false;
  const result = await sendTelegram(
    chat,
    `Acompanhamento de exames ${p.followupId}, cliente #${p.clienteId}: resposta ${p.intent}. Abra a conversa no Cockpit protegido.`,
  );
  return result.sent && !result.mock;
}

async function enviarConfirmacaoResposta(p: ProcessedReply, alertAccepted: boolean): Promise<void> {
  const texto = respostaAoCliente(p.stage, p.intent, alertAccepted);
  const result = await sendTelegram(p.chatId, escaparHtmlTelegram(texto), { disableWebPagePreview: true });
  const ackState = result.mock ? "simulated" : result.sent ? "accepted" : "unknown";
  const ackColumn = p.stage === "receipt" ? sql`receipt_ack_state` : sql`booking_ack_state`;
  await db.execute(sql`
    UPDATE telegram_exam_followups
    SET ${ackColumn} = ${ackState}, updated_at = NOW()
    WHERE id = ${p.followupId}
  `);
  if (result.sent && !result.mock) {
    await db.execute(sql`
      INSERT INTO telegram_inbox_messages
        (empresa_id, cliente_id, chat_id, texto, recebida_em, direcao, lida_em)
      VALUES (${p.empresaId}, ${p.clienteId}, ${p.chatId}, ${texto}, ${brtNow()}, 'saida', ${brtNow()})
    `);
  }
}

async function processarRespostasPendentes(limit = 50): Promise<void> {
  const result = await db.execute(sql`
    SELECT m.id AS inbox_message_id, m.empresa_id, m.cliente_id, m.chat_id, m.texto, m.recebida_em,
      f.id AS followup_id,
      CASE WHEN f.state = 'receipt_waiting' THEN 'receipt' ELSE 'booking' END AS stage
    FROM telegram_inbox_messages m
    JOIN telegram_exam_followups f
      ON f.empresa_id = m.empresa_id AND f.cliente_id = m.cliente_id AND f.chat_id = m.chat_id
    LEFT JOIN telegram_atendimento_respostas a ON a.inbox_message_id = m.id
    WHERE m.direcao = 'entrada'
      AND (
        (f.state = 'receipt_waiting' AND f.receipt_sent_at IS NOT NULL
          AND m.recebida_em >= f.receipt_sent_at AND f.receipt_reply_inbox_message_id IS NULL)
        OR
        (f.state = 'booking_waiting' AND f.booking_sent_at IS NOT NULL
          AND m.recebida_em >= f.booking_sent_at AND f.booking_reply_inbox_message_id IS NULL)
      )
      AND (a.inbox_message_id IS NULL OR a.estado IN ('pendente', 'falhou')
        OR (a.estado = 'concluido' AND a.desfecho = 'desligado_ou_fora_da_lista'))
    ORDER BY m.recebida_em, m.id
    LIMIT ${limit}
  `);
  const groups = new Map<number, ReplyCandidate[]>();
  for (const row of result.rows as ReplyCandidate[]) {
    const id = Number(row.inbox_message_id);
    const items = groups.get(id) ?? [];
    items.push(row);
    groups.set(id, items);
  }
  for (const [inboxMessageId, candidates] of groups) {
    if (candidates.length !== 1) {
      const first = candidates[0];
      await db.transaction(async (tx) => {
        await registrarMensagemComoTratada(tx, inboxMessageId, "exam_followup_multiple_active_cases");
        await tx.execute(sql`
          UPDATE telegram_exam_followups
          SET state = 'needs_review', error_code = 'multiple_active_cases',
              close_reason = 'client_reply_matches_multiple_cases', updated_at = NOW()
          WHERE id IN (${sql.join(candidates.map((candidate) => sql`${Number(candidate.followup_id)}`), sql`, `)})
        `);
        await marcarParaHumano(tx, Number(first.cliente_id), "exam_followup_multiple_active_cases");
      });
      const alert: ProcessedReply = {
        followupId: Number(first.followup_id), clienteId: Number(first.cliente_id),
        empresaId: Number(first.empresa_id), chatId: first.chat_id, stage: first.stage,
        intent: "ambiguous", handoff: true,
      };
      const accepted = await enviarAlertaEquipe(alert).catch(() => false);
      await db.execute(sql`
        UPDATE telegram_exam_followups SET team_alert_state = ${accepted ? "accepted" : "failed"},
          updated_at = NOW()
        WHERE id IN (${sql.join(candidates.map((candidate) => sql`${Number(candidate.followup_id)}`), sql`, `)})
      `);
      continue;
    }
    const processed = await processarResposta(candidates[0]);
    if (!processed) continue;
    const alertAccepted = processed.handoff
      ? await enviarAlertaEquipe(processed).catch(() => false)
      : false;
    if (processed.handoff) {
      await db.execute(sql`
        UPDATE telegram_exam_followups SET team_alert_state = ${alertAccepted ? "accepted" : "failed"},
          updated_at = NOW()
        WHERE id = ${processed.followupId}
      `);
    }
    await enviarConfirmacaoResposta(processed, alertAccepted).catch(() => {
      logger.warn({ followupId: processed.followupId }, "[telegram] confirmação de resposta sem resultado; não será reenviada");
      const ackColumn = processed.stage === "receipt" ? sql`receipt_ack_state` : sql`booking_ack_state`;
      return db.execute(sql`
        UPDATE telegram_exam_followups SET ${ackColumn} = 'unknown',
          error_code = COALESCE(error_code, 'reply_ack_result_unknown'), updated_at = NOW()
        WHERE id = ${processed.followupId}
      `);
    });
  }
}

async function reconciliarConfigDesativada(): Promise<void> {
  if (await getSetting("telegram.active") !== "true") {
    await db.execute(sql`
      UPDATE telegram_exam_followups
      SET state = CASE WHEN state IN ('receipt_sending', 'booking_sending') THEN 'needs_review' ELSE 'cancelled' END,
          receipt_delivery_state = CASE WHEN state = 'receipt_sending' THEN 'unknown' ELSE receipt_delivery_state END,
          booking_delivery_state = CASE WHEN state = 'booking_sending' THEN 'unknown' ELSE booking_delivery_state END,
          close_reason = 'telegram_disabled',
          error_code = CASE WHEN state IN ('receipt_sending', 'booking_sending')
            THEN 'telegram_disabled_during_send' ELSE error_code END,
          closed_at = CASE WHEN state IN ('receipt_sending', 'booking_sending') THEN closed_at ELSE NOW() END,
          updated_at = NOW()
      WHERE state IN (${sql.join(ACTIVE_STATES.map((state) => sql`${state}`), sql`, `)})
    `);
  }
}

export async function processarAcompanhamentosExamesPendentes(): Promise<void> {
  await ensureTelegramExamFollowupsTable(db);
  await reconciliarConfigDesativada();
  await reconciliarReservasDeEnvio();
  await recuperarEnviosInterrompidos();
  await processarRespostasPendentes();
  await processarEnviosVencidos();
}
