import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";
import type { EntradaAtendimento, PlanoAtendimento } from "./atendimento-telegram";
import { getIssuedDocument, criarTokenClinicalShare } from "./clinical-document-share";
import { absoluteBaseUrl } from "./messaging/base-url";
import { escaparHtmlTelegram } from "./orientacao-texto";
import { sendTelegram } from "./telegram";
import { vinculoTelegramAtualUnico } from "./telegram-vinculo-atual";
import {
  confirmClinicalDocumentReissueRequest,
  createReissueRequest,
  recordClinicalDocumentReissueEvent,
} from "./clinical-document-reissue-policy";
import { createAndSendReissueCharge } from "./clinical-document-reissue-billing";

interface ExecutorReenvio {
  execute(query: SQL): Promise<{ rows: unknown[] }>;
}

interface DocumentoVerificado {
  pdfSha256: string;
  profissionalId: number | null;
  locationId: number;
  titulo: string;
  documentType: NonNullable<PlanoAtendimento["documento"]>["documentType"];
  documentId: number;
}

async function verificarDocumento(
  exec: ExecutorReenvio,
  e: EntradaAtendimento,
  documentType: DocumentoVerificado["documentType"],
  documentId: number,
): Promise<DocumentoVerificado | null> {
  if (!documentType || !Number.isSafeInteger(documentId) || documentId <= 0) return null;
  if (!await vinculoTelegramAtualUnico(exec, { clienteId: e.clienteId, empresaId: e.empresaId, chatId: e.chatId })) return null;
  const client = await exec.execute(sql`SELECT id,location_id FROM clients
    WHERE id=${e.clienteId} AND empresa_id=${e.empresaId} AND telegram_chat_id=${e.chatId}
      AND status='active' AND deleted_at IS NULL LIMIT 1`);
  if (client.rows.length !== 1) return null;
  const locationId = Number((client.rows[0] as { location_id?: number | string }).location_id);
  if (!Number.isSafeInteger(locationId) || locationId <= 0) return null;
  const document = await getIssuedDocument(documentType, documentId);
  if (!document || document.status !== "emitted" || document.clientId !== e.clienteId ||
      document.empresaId !== e.empresaId || document.locationId !== locationId ||
      (documentType !== "documento_assinado" &&
        (typeof document.professionalId !== "number" || !Number.isSafeInteger(document.professionalId) || !document.professionalId)) ||
      ((documentType === "prescricao" || documentType === "documento_assinado") && document.signatureStatus !== "signed") ||
      !document.issuedAt || !document.pdfData) return null;
  const bytes = Buffer.from(document.pdfData, "base64");
  if (bytes.length === 0 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") return null;
  return {
    pdfSha256: createHash("sha256").update(bytes).digest("hex"),
    profissionalId: document.professionalId ?? null,
    locationId,
    titulo: document.label,
    documentType,
    documentId,
  };
}

function requestOperationKey(e: EntradaAtendimento): string {
  const hex = createHash("sha256")
    .update(`telegram-reissue:${e.empresaId}:${e.clienteId}:${e.inboxMessageId}`)
    .digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const raw = hex.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

export async function autorizarOfertaReenvio(
  exec: ExecutorReenvio,
  e: EntradaAtendimento,
  plano: PlanoAtendimento,
): Promise<boolean> {
  const documento = plano.documento;
  const documentType = documento?.documentType ?? (documento?.receitaId ? "prescricao" : undefined);
  const documentId = Number(documento?.documentId ?? documento?.receitaId);
  if (documento?.acao !== "ofertar_reenvio" || !documentType || !Number.isSafeInteger(documentId) || documentId <= 0) return false;
  const issued = await verificarDocumento(exec, e, documentType, documentId);
  if (!issued) return false;
  let reissueRequestId = documento.reissueRequestId;
  if (!reissueRequestId) {
    const request = await createReissueRequest({
      operationKey: requestOperationKey(e),
      clientId: e.clienteId,
      empresaId: e.empresaId,
      locationId: issued.locationId,
      documentType,
      documentId,
      requestedByChannel: "telegram",
      clientConsent: false,
    });
    reissueRequestId = request.id;
  }
  const requestRows = await exec.execute(sql`SELECT id,document_pdf_sha256,request_status,document_type,document_id
    FROM clinical_document_reissue_requests
    WHERE id=${reissueRequestId}::bigint AND client_id=${e.clienteId} AND empresa_id=${e.empresaId}
      AND location_id=${issued.locationId} LIMIT 1`);
  const request = requestRows.rows[0] as {
    id: string | number; document_pdf_sha256: string | null; request_status: string;
    document_type: string; document_id: string | null;
  } | undefined;
  if (!request || request.request_status !== "awaiting_confirmation" ||
      request.document_type !== documentType || Number(request.document_id) !== documentId ||
      request.document_pdf_sha256 !== issued.pdfSha256) return false;
  await exec.execute(sql`UPDATE telegram_documento_reenvios SET status='falhou',atualizado_em=NOW()
    WHERE empresa_id=${e.empresaId} AND cliente_id=${e.clienteId}
      AND status='ofertando' AND atualizado_em<=NOW()-interval '24 hours'`);
  await exec.execute(sql`UPDATE telegram_documento_reenvios SET status='expirado',atualizado_em=NOW()
    WHERE empresa_id=${e.empresaId} AND cliente_id=${e.clienteId} AND status='oferecido' AND expira_em<=NOW()`);
  const r = await exec.execute(sql`INSERT INTO telegram_documento_reenvios
      (empresa_id,cliente_id,chat_id,recipe_id,prescription_id,document_type,document_id,
       reissue_request_id,pdf_sha256,oferta_inbox_message_id,status,expira_em)
    SELECT ${e.empresaId},${e.clienteId},${e.chatId},
      ${documentType === "prescricao" ? documentId : null},
      ${documentType === "prescricao" ? (documento.prescricaoId ?? null) : null},
      ${documentType},${documentId},${reissueRequestId}::bigint,
      ${issued.pdfSha256},${e.inboxMessageId},'ofertando',NOW()+interval '24 hours'
    WHERE NOT EXISTS (
      SELECT 1 FROM telegram_documento_reenvios ativo
      WHERE ativo.empresa_id=${e.empresaId} AND ativo.cliente_id=${e.clienteId}
        AND ativo.status IN ('ofertando','oferecido','enviando')
        AND ativo.oferta_inbox_message_id<>${e.inboxMessageId}
    )
    ON CONFLICT (oferta_inbox_message_id) DO UPDATE SET atualizado_em=NOW()
    WHERE telegram_documento_reenvios.status='ofertando'
      AND telegram_documento_reenvios.empresa_id=${e.empresaId}
      AND telegram_documento_reenvios.cliente_id=${e.clienteId}
      AND telegram_documento_reenvios.chat_id=${e.chatId}
      AND telegram_documento_reenvios.document_type=${documentType}
      AND telegram_documento_reenvios.document_id=${documentId}
      AND telegram_documento_reenvios.reissue_request_id=${reissueRequestId}::bigint
      AND telegram_documento_reenvios.pdf_sha256=${issued.pdfSha256}
    RETURNING id`);
  return r.rows.length === 1;
}

export async function autorizarConfirmacaoReenvio(
  exec: ExecutorReenvio,
  e: EntradaAtendimento,
  plano: PlanoAtendimento,
): Promise<boolean> {
  const documento = plano.documento;
  if (documento?.acao !== "confirmar_reenvio" || !documento.ofertaId || !documento.reissueRequestId) return false;
  const ofertaRows = await exec.execute(sql`SELECT document_type,document_id,reissue_request_id,pdf_sha256
    FROM telegram_documento_reenvios WHERE id=${documento.ofertaId} AND empresa_id=${e.empresaId}
      AND cliente_id=${e.clienteId} AND chat_id=${e.chatId}
      AND (status='oferecido' OR (status='enviando' AND confirmacao_inbox_message_id=${e.inboxMessageId}))
      AND expira_em>NOW() LIMIT 1`);
  const offer = ofertaRows.rows[0] as {
    document_type: DocumentoVerificado["documentType"]; document_id: number | string;
    reissue_request_id: string | number; pdf_sha256: string;
  } | undefined;
  if (!offer || String(offer.reissue_request_id) !== documento.reissueRequestId) return false;
  const documentId = Number(offer.document_id);
  const issued = await verificarDocumento(exec, e, offer.document_type, documentId);
  if (!issued || issued.pdfSha256 !== offer.pdf_sha256) return false;
  const confirmed = await confirmClinicalDocumentReissueRequest({
    requestId: documento.reissueRequestId,
    clientId: e.clienteId,
    empresaId: e.empresaId,
    locationId: issued.locationId,
    confirmationMessageId: e.inboxMessageId,
  });
  if (!confirmed) return false;
  const r = await exec.execute(sql`UPDATE telegram_documento_reenvios
    SET status='enviando',confirmacao_inbox_message_id=${e.inboxMessageId},atualizado_em=NOW()
    WHERE id=${documento.ofertaId} AND empresa_id=${e.empresaId} AND cliente_id=${e.clienteId}
      AND chat_id=${e.chatId} AND document_type=${offer.document_type}
      AND document_id=${documentId} AND reissue_request_id=${documento.reissueRequestId}::bigint
      AND pdf_sha256=${issued.pdfSha256}
      AND expira_em>NOW()
      AND (status='oferecido' OR (status='enviando' AND confirmacao_inbox_message_id=${e.inboxMessageId}))
    RETURNING id`);
  return r.rows.length === 1;
}

export async function autorizarCancelamentoReenvio(
  exec: ExecutorReenvio,
  e: EntradaAtendimento,
  plano: PlanoAtendimento,
): Promise<boolean> {
  const documento = plano.documento;
  if (documento?.acao !== "cancelar_reenvio" || !documento.ofertaId) return false;
  const request = await exec.execute(sql`UPDATE clinical_document_reissue_requests
    SET request_status='cancelled',payment_status=CASE WHEN payment_status='awaiting_consent' THEN 'cancelled' ELSE payment_status END,
        updated_at=NOW()
    WHERE id=(SELECT reissue_request_id FROM telegram_documento_reenvios
      WHERE id=${documento.ofertaId} AND empresa_id=${e.empresaId} AND cliente_id=${e.clienteId}
        AND chat_id=${e.chatId} AND status='oferecido' AND expira_em>NOW())
      AND request_status IN ('awaiting_confirmation','awaiting_review') RETURNING id`);
  if (!request.rows.length) return false;
  const r = await exec.execute(sql`UPDATE telegram_documento_reenvios
    SET status='cancelado',confirmacao_inbox_message_id=${e.inboxMessageId},atualizado_em=NOW()
    WHERE id=${documento.ofertaId} AND empresa_id=${e.empresaId} AND cliente_id=${e.clienteId}
      AND chat_id=${e.chatId} AND status='oferecido' AND expira_em>NOW()
    RETURNING id`);
  return r.rows.length === 1;
}

export async function marcarOfertaReenvioEntregue(e: EntradaAtendimento): Promise<void> {
  await db.execute(sql`UPDATE telegram_documento_reenvios SET status='oferecido',
      expira_em=NOW()+interval '24 hours',atualizado_em=NOW()
    WHERE oferta_inbox_message_id=${e.inboxMessageId} AND empresa_id=${e.empresaId}
      AND cliente_id=${e.clienteId} AND chat_id=${e.chatId} AND status='ofertando'`);
}

export async function marcarReenvioConcluido(e: EntradaAtendimento, plano: PlanoAtendimento): Promise<void> {
  const documento = plano.documento;
  if (documento?.acao !== "confirmar_reenvio" || !documento.ofertaId) return;
  await db.execute(sql`UPDATE telegram_documento_reenvios SET status='enviado',atualizado_em=NOW()
    WHERE id=${documento.ofertaId} AND empresa_id=${e.empresaId} AND cliente_id=${e.clienteId}
      AND chat_id=${e.chatId} AND confirmacao_inbox_message_id=${e.inboxMessageId}
      AND status='enviando'`);
}

export async function enviarLinkReceitaConfirmada(
  chat: string,
  e: EntradaAtendimento,
  plano: PlanoAtendimento,
  dono: string,
): Promise<{ sent: boolean; mock: boolean; error?: string; textoHistorico?: string }> {
  const documento = plano.documento;
  if (documento?.acao !== "confirmar_reenvio" || !documento.ofertaId ||
      !documento.reissueRequestId || !documento.documentType || !documento.documentId || chat !== e.chatId) {
    return { sent: false, mock: false, error: "reenvio_nao_autorizado" };
  }
  const oferta = await db.execute(sql`SELECT id,pdf_sha256,document_type,document_id,reissue_request_id
    FROM telegram_documento_reenvios
    WHERE id=${documento.ofertaId} AND empresa_id=${e.empresaId} AND cliente_id=${e.clienteId}
      AND chat_id=${e.chatId} AND document_type=${documento.documentType}
      AND document_id=${documento.documentId} AND reissue_request_id=${documento.reissueRequestId}::bigint
      AND status='enviando' AND confirmacao_inbox_message_id=${e.inboxMessageId} LIMIT 1`);
  const atual = oferta.rows[0] as {
    id: number | string; pdf_sha256: string; document_type: DocumentoVerificado["documentType"];
    document_id: number | string; reissue_request_id: number | string;
  } | undefined;
  if (!atual) return { sent: false, mock: false, error: "oferta_de_reenvio_indisponivel" };
  const issued = await verificarDocumento(db, e, atual.document_type, Number(atual.document_id));
  if (!issued || issued.pdfSha256 !== atual.pdf_sha256) {
    await db.execute(sql`UPDATE clinical_document_reissue_requests
      SET request_status='unknown',delivery_status='unknown',
          delivery_result='O documento original mudou ou não pôde ser revalidado após a confirmação.',
          updated_at=NOW()
      WHERE id=${documento.reissueRequestId}::bigint`);
    return { sent: false, mock: false, error: "documento_alterado_ou_indisponivel" };
  }

  const requestRows = await db.execute(sql`SELECT request_status,payment_status,payment_provider,fee_amount
    FROM clinical_document_reissue_requests WHERE id=${documento.reissueRequestId}::bigint
      AND client_id=${e.clienteId} AND empresa_id=${e.empresaId} AND location_id=${issued.locationId} LIMIT 1`);
  const request = requestRows.rows[0] as {
    request_status: string; payment_status: string; payment_provider: string | null;
    fee_amount: string | number | null;
  } | undefined;
  if (!request) return { sent: false, mock: false, error: "solicitacao_indisponivel" };

  const canDeliver = request.request_status === "approved" &&
    (request.payment_status === "not_required" || request.payment_status === "paid");
  if (!canDeliver) {
    if (request.request_status === "awaiting_payment" &&
        request.payment_status === "unverified" && request.payment_provider === null) {
      const charge = await createAndSendReissueCharge(documento.reissueRequestId, chat);
      if (charge.sent) {
        return {
          sent: true,
          mock: false,
          textoHistorico: "Link da taxa administrativa enviado após consentimento explícito; entrega documental bloqueada até pagamento confirmado.",
        };
      }
      const paymentFailure = "Não consegui confirmar a criação ou o envio do link de pagamento. Não vou repetir a cobrança automaticamente; a equipe vai conferir antes de qualquer novo envio.";
      const notice = await sendTelegram(chat, paymentFailure);
      return { ...notice, error: charge.error, textoHistorico: paymentFailure };
    }
    const message = request.request_status === "awaiting_review"
      ? "Recebi seu pedido. A equipe vai conferir a vigência do tratamento ou a assinatura PaxMed Members antes de liberar. Não houve cobrança nem envio do documento."
      : request.request_status === "awaiting_payment"
        ? "Recebi sua confirmação. O envio continua bloqueado até o pagamento da taxa administrativa ser confirmado pela clínica."
        : "Recebi seu pedido. Ele permanece em conferência; não houve cobrança nem envio do documento.";
    const result = await sendTelegram(chat, message);
    if (result.sent) {
      await db.execute(sql`UPDATE clinical_document_reissue_requests
        SET delivery_channel='telegram',delivery_result=${message},updated_at=NOW()
        WHERE id=${documento.reissueRequestId}::bigint AND request_status=${request.request_status}`);
    }
    return { ...result, textoHistorico: message };
  }
  const result = await deliverApprovedClinicalDocumentReissue(documento.reissueRequestId);
  if (!result.sent) return { ...result, textoHistorico: "A segunda via ainda não foi liberada. A equipe precisa conferir o registro." };
  return {
    ...result,
    textoHistorico: "Link seguro da segunda via enviado para o Telegram, com validade de sete dias.",
  };
}

export async function deliverApprovedClinicalDocumentReissue(
  requestId: string,
): Promise<{ sent: boolean; mock: boolean; error?: string }> {
  const rows = await db.execute(sql`SELECT r.id,r.client_id,r.empresa_id,r.location_id,r.document_type,
      r.document_id,r.document_label,r.document_pdf_sha256,r.payment_status,c.telegram_chat_id
    FROM clinical_document_reissue_requests r
    JOIN clients c ON c.id=r.client_id
    WHERE r.id=${requestId}::bigint AND r.request_status='approved'
      AND r.payment_status IN ('not_required','paid')
      AND r.delivery_status='not_started'
      AND c.status='active' AND c.deleted_at IS NULL
    LIMIT 1`);
  const row = rows.rows[0] as {
    id: string | number; client_id: number | string; empresa_id: number | string;
    location_id: number | string; document_type: DocumentoVerificado["documentType"];
    document_id: string | null; document_label: string; document_pdf_sha256: string | null;
    telegram_chat_id: string | null;
  } | undefined;
  if (!row || !row.document_type || !row.document_id || !row.document_pdf_sha256 || !row.telegram_chat_id) {
    return { sent: false, mock: false, error: "solicitacao_aprovada_ou_destino_indisponivel" };
  }
  const clientId = Number(row.client_id);
  const empresaId = Number(row.empresa_id);
  const locationId = Number(row.location_id);
  const chatId = row.telegram_chat_id;
  if (!await vinculoTelegramAtualUnico(db, { clienteId: clientId, empresaId, chatId })) {
    return { sent: false, mock: false, error: "vinculo_telegram_nao_unico" };
  }
  const issued = await getIssuedDocument(row.document_type, Number(row.document_id));
  if (!issued || issued.status !== "emitted" || issued.clientId !== clientId ||
      issued.empresaId !== empresaId || issued.locationId !== locationId || !issued.pdfData ||
      createHash("sha256").update(Buffer.from(issued.pdfData, "base64")).digest("hex") !== row.document_pdf_sha256) {
    await db.execute(sql`UPDATE clinical_document_reissue_requests
      SET request_status='unknown',delivery_status='unknown',
          delivery_result='O arquivo original mudou antes da entrega; requer nova conferência.',updated_at=NOW()
      WHERE id=${requestId}::bigint AND request_status='approved'`);
    return { sent: false, mock: false, error: "documento_original_alterado" };
  }
  let baseUrl: URL;
  try {
    baseUrl = new URL(absoluteBaseUrl());
  } catch {
    return { sent: false, mock: false, error: "dominio_seguro_indisponivel" };
  }
  if (baseUrl.protocol !== "https:") return { sent: false, mock: false, error: "dominio_seguro_indisponivel" };

  const share = criarTokenClinicalShare();
  const claimed = await db.execute(sql`UPDATE clinical_document_reissue_requests
    SET request_status='delivery_pending',delivery_status='queued',delivery_channel='telegram',
        delivery_attempted_at=NOW(),delivery_result='Envio iniciado; aguardando confirmação do Telegram.',
        delivery_share_token_hash=${share.tokenHash},
        delivery_share_expires_at=${new Date(share.expiresAt)},updated_at=NOW()
    WHERE id=${requestId}::bigint AND request_status='approved'
      AND payment_status IN ('not_required','paid') AND delivery_status='not_started'
    RETURNING id`);
  if (!claimed.rows.length) return { sent: false, mock: false, error: "entrega_ja_iniciada_ou_bloqueada" };
  await recordClinicalDocumentReissueEvent({
    requestId,
    empresaId,
    locationId,
    eventType: "delivery_started",
    details: { channel: "telegram" },
  });

  const url = `${baseUrl.origin}/api/clinical-documents/share/${share.token}`;
  const message = `Segue o link seguro para acessar a segunda via de ${escaparHtmlTelegram(issued.label)}. ` +
    `Ele fica válido por sete dias: <a href="${escaparHtmlTelegram(url)}">Abrir documento</a>.`;
  let result: { sent: boolean; mock: boolean; error?: string };
  try {
    result = await sendTelegram(chatId, message, { disableWebPagePreview: true });
  } catch {
    result = { sent: false, mock: false, error: "resultado_do_envio_indeterminado" };
  }
  await db.execute(sql`UPDATE clinical_document_reissue_requests
    SET request_status=${result.sent ? "provider_accepted" : "unknown"},
        delivery_status=${result.sent ? "provider_accepted" : "unknown"},
        delivery_completed_at=CASE WHEN ${result.sent} THEN NOW() ELSE delivery_completed_at END,
        delivery_result=${result.sent
          ? "O Telegram confirmou o envio do link seguro."
          : "O Telegram não confirmou o resultado; confira antes de repetir."},
        updated_at=NOW()
    WHERE id=${requestId}::bigint AND request_status='delivery_pending'`);
  await recordClinicalDocumentReissueEvent({
    requestId,
    empresaId,
    locationId,
    eventType: result.sent ? "delivery_provider_accepted" : "delivery_unknown",
    details: { channel: "telegram", confirmed: result.sent },
  });
  return result;
}

