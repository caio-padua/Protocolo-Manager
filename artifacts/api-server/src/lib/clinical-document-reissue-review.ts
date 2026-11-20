import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { getIssuedDocument, type ClinicalDocumentType } from "./clinical-document-share";
import { readReissuePolicy, recordClinicalDocumentReissueEvent } from "./clinical-document-reissue-policy";
import { sendTelegram } from "./telegram";
import { vinculoTelegramAtualUnico } from "./telegram-vinculo-atual";

export type ReviewResolution = "free_treatment" | "fee_required";

export type ResolveReviewResult =
  | { ok: true; status: "awaiting_confirmation"; feeAmount: number | null }
  | { ok: false; httpStatus: number; error: string };

const brl = (value: number) => `R$ ${value.toFixed(2).replace(".", ",")}`;

/**
 * A conferência humana decide a elegibilidade, mas NÃO libera nada: ela congela a
 * taxa (se houver) e pede o consentimento do próprio cliente pelo Telegram. Só depois
 * do "sim" do cliente o pedido segue para cobrança ou entrega (cópia exata, por hash).
 */
export async function resolveReissueReview(input: {
  requestId: number;
  actorProfessionalId: number;
  resolution: ReviewResolution;
  reason: string;
}): Promise<ResolveReviewResult> {
  const rows = await db.execute(sql`SELECT r.id,r.client_id,r.empresa_id,r.location_id,r.document_type,
      r.document_id,r.document_label,r.document_pdf_sha256,r.request_status,r.eligibility_status,
      r.client_consent_at,r.asaas_charge_id,r.payment_provider,c.telegram_chat_id
    FROM clinical_document_reissue_requests r
    JOIN clients c ON c.id=r.client_id
    WHERE r.id=${input.requestId}::bigint LIMIT 1`);
  const row = rows.rows[0] as {
    id: number | string; client_id: number | string; empresa_id: number | string; location_id: number | string;
    document_type: ClinicalDocumentType; document_id: string | null; document_label: string;
    document_pdf_sha256: string | null; request_status: string; eligibility_status: string;
    client_consent_at: unknown; asaas_charge_id: string | null; payment_provider: string | null;
    telegram_chat_id: string | null;
  } | undefined;
  if (!row || row.request_status !== "awaiting_review" || row.eligibility_status !== "human_review" ||
      row.client_consent_at || row.asaas_charge_id || row.payment_provider) {
    return { ok: false, httpStatus: 409, error: "Esta solicitação não está aguardando conferência humana." };
  }
  if (!row.document_pdf_sha256 || !row.document_id) {
    return { ok: false, httpStatus: 409, error: "O documento original não foi verificado; não há o que liberar. Recuse o pedido ou emita novo documento." };
  }
  const clientId = Number(row.client_id);
  const empresaId = Number(row.empresa_id);
  const locationId = Number(row.location_id);
  const policy = await readReissuePolicy(empresaId, locationId);
  if (!policy.enabled || policy.documentTypes[row.document_type] !== true) {
    return { ok: false, httpStatus: 409, error: "A segunda via está desativada para esta clínica ou tipo de documento." };
  }
  if (input.resolution === "fee_required" && !policy.feeCollectionEnabled) {
    return { ok: false, httpStatus: 409, error: "A cobrança de taxa está desativada para esta clínica." };
  }
  const chatId = row.telegram_chat_id?.trim();
  if (!chatId || !await vinculoTelegramAtualUnico(db, { clienteId: clientId, empresaId, chatId })) {
    return { ok: false, httpStatus: 422, error: "O cliente não tem um Telegram vinculado de forma única para confirmar o pedido." };
  }
  const issued = await getIssuedDocument(row.document_type, Number(row.document_id));
  if (!issued || issued.status !== "emitted" || issued.clientId !== clientId ||
      issued.empresaId !== empresaId || issued.locationId !== locationId || !issued.pdfData ||
      createHash("sha256").update(Buffer.from(issued.pdfData, "base64")).digest("hex") !== row.document_pdf_sha256) {
    return { ok: false, httpStatus: 409, error: "O documento original mudou ou saiu da clínica de emissão; refaça o pedido." };
  }

  const fee = input.resolution === "fee_required" ? policy.feeAmount : null;
  const claimed = await db.execute(sql`UPDATE clinical_document_reissue_requests
    SET request_status='awaiting_confirmation',eligibility_status=${input.resolution},
        fee_amount=${fee},payment_status=${fee === null ? "not_required" : "awaiting_consent"},
        eligibility_reason=${input.reason},review_note=${input.reason},
        reviewed_by_professional_id=${input.actorProfessionalId},reviewed_at=NOW(),review_resolved_at=NOW(),
        updated_at=NOW()
    WHERE id=${input.requestId}::bigint AND request_status='awaiting_review'
      AND eligibility_status='human_review' AND client_consent_at IS NULL
      AND asaas_charge_id IS NULL AND payment_provider IS NULL
    RETURNING id`);
  if (!claimed.rows.length) {
    return { ok: false, httpStatus: 409, error: "Esta solicitação já foi resolvida por outra pessoa." };
  }

  const rollback = async (why: string) => {
    await db.execute(sql`UPDATE clinical_document_reissue_requests
      SET request_status='awaiting_review',eligibility_status='human_review',fee_amount=NULL,
          payment_status='unverified',review_resolved_at=NULL,reviewed_at=NULL,
          reviewed_by_professional_id=NULL,eligibility_reason=${why},updated_at=NOW()
      WHERE id=${input.requestId}::bigint AND request_status='awaiting_confirmation' AND client_consent_at IS NULL`);
    await db.execute(sql`UPDATE telegram_documento_reenvios SET status='falhou',atualizado_em=NOW()
      WHERE reissue_request_id=${input.requestId}::bigint AND status='oferecido'`);
  };

  await db.execute(sql`UPDATE telegram_documento_reenvios SET status='expirado',atualizado_em=NOW()
    WHERE empresa_id=${empresaId} AND cliente_id=${clientId} AND status='oferecido' AND expira_em<=NOW()`);
  const isPrescription = row.document_type === "prescricao";
  const offer = await db.execute(sql`INSERT INTO telegram_documento_reenvios
      (empresa_id,cliente_id,chat_id,recipe_id,prescription_id,document_type,document_id,
       reissue_request_id,pdf_sha256,oferta_inbox_message_id,status,expira_em)
    SELECT ${empresaId},${clientId},${chatId},
      ${isPrescription ? Number(row.document_id) : null},
      ${isPrescription ? (issued.prescriptionId ?? null) : null},
      ${row.document_type},${Number(row.document_id)},${input.requestId}::bigint,
      ${row.document_pdf_sha256},${-input.requestId},'oferecido',NOW()+interval '24 hours'
    WHERE NOT EXISTS (
      SELECT 1 FROM telegram_documento_reenvios ativo
      WHERE ativo.empresa_id=${empresaId} AND ativo.cliente_id=${clientId}
        AND ativo.status IN ('ofertando','oferecido','enviando'))
    ON CONFLICT (oferta_inbox_message_id) DO NOTHING
    RETURNING id`);
  if (!offer.rows.length) {
    await rollback("Há outra oferta de segunda via aberta para este cliente; resolva-a antes.");
    return { ok: false, httpStatus: 409, error: "Há outra oferta de segunda via aberta para este cliente. Aguarde o cliente responder ou expirar." };
  }

  const text = fee === null
    ? `A equipe conferiu seu pedido de segunda via de ${row.document_label}. A segunda via será enviada sem cobrança. Para confirmar, responda somente “sim”. Para desistir, responda “não”.`
    : `A equipe conferiu seu pedido de segunda via de ${row.document_label}. Será cobrada uma taxa administrativa de ${brl(fee)}, e o documento só é enviado depois do pagamento confirmado. Para confirmar, responda somente “sim”. Para desistir, responda “não”.`;
  let sent = false;
  try {
    sent = (await sendTelegram(chatId, text)).sent;
  } catch {
    sent = false;
  }
  if (!sent) {
    await rollback("Não foi possível pedir o consentimento ao cliente pelo Telegram; a conferência foi reaberta.");
    return { ok: false, httpStatus: 502, error: "O Telegram não confirmou o envio do pedido de consentimento; a conferência foi reaberta." };
  }
  await recordClinicalDocumentReissueEvent({
    requestId: String(input.requestId),
    empresaId,
    locationId,
    actorProfessionalId: input.actorProfessionalId,
    eventType: "review_resolved",
    details: { resolution: input.resolution, feeAmount: fee, reason: input.reason },
  });
  return { ok: true, status: "awaiting_confirmation", feeAmount: fee };
}

export type StaffResendGate =
  | { mode: "legacy" }
  | { mode: "allowed"; requestId: string; replay: boolean }
  | { mode: "blocked"; requestId: string; message: string };

/**
 * Reenvio manual por profissional. Com a segunda via ligada na clínica, ele passa pela
 * mesma política: vigência/gratuidade, taxa e conferência humana. Só cópia sem cobrança
 * (tratamento vigente) sai direto; o resto vira pedido na fila de conferência.
 * Com a segunda via desligada na clínica, o reenvio profissional segue como antes.
 */
export async function gateStaffResend(input: {
  clientId: number;
  empresaId: number;
  locationId: number;
  documentType: ClinicalDocumentType;
  documentId: number;
  channels: string[];
  professionalId: number;
  operationKey: string;
}): Promise<StaffResendGate> {
  const policy = await readReissuePolicy(input.empresaId, input.locationId);
  if (!policy.enabled) return { mode: "legacy" };
  const existing = await db.execute(sql`SELECT id FROM clinical_document_reissue_requests
    WHERE operation_key=${input.operationKey}::uuid LIMIT 1`);
  if (existing.rows.length) {
    return { mode: "allowed", requestId: String((existing.rows[0] as { id: number | string }).id), replay: true };
  }
  const { createReissueRequest } = await import("./clinical-document-reissue-policy");
  const created = await createReissueRequest({
    clientId: input.clientId,
    empresaId: input.empresaId,
    locationId: input.locationId,
    documentType: input.documentType,
    documentId: input.documentId,
    requestedByChannel: "staff",
    clientConsent: false,
    operationKey: input.operationKey,
  });
  const free = created.eligibility === "free_treatment" || created.eligibility === "free_member";
  if (free && created.status === "awaiting_confirmation" && created.documentHash) {
    const claimed = await db.execute(sql`UPDATE clinical_document_reissue_requests
      SET request_status='delivery_pending',delivery_status='queued',
          delivery_channel=${input.channels.join(",")},delivery_attempted_at=NOW(),
          payment_status='not_required',reviewed_by_professional_id=${input.professionalId},
          reviewed_at=NOW(),review_resolved_at=NOW(),
          review_note='Cópia sem cobrança enviada por profissional autenticado (tratamento vigente).',
          updated_at=NOW()
      WHERE id=${created.id}::bigint AND request_status='awaiting_confirmation'
      RETURNING id`);
    if (claimed.rows.length) {
      await recordClinicalDocumentReissueEvent({
        requestId: created.id, empresaId: input.empresaId, locationId: input.locationId,
        actorProfessionalId: input.professionalId, eventType: "staff_delivery_started",
        details: { channels: input.channels },
      });
      return { mode: "allowed", requestId: created.id, replay: false };
    }
  }
  if (created.status === "awaiting_confirmation" || created.status === "awaiting_payment") {
    await db.execute(sql`UPDATE clinical_document_reissue_requests
      SET request_status='awaiting_review',eligibility_status='human_review',fee_amount=NULL,
          payment_status='unverified',
          eligibility_reason='Reenvio manual fora do tratamento vigente: exige conferência humana e consentimento do cliente.',
          updated_at=NOW()
      WHERE id=${created.id}::bigint AND request_status IN ('awaiting_confirmation','awaiting_payment')
        AND client_consent_at IS NULL`);
  }
  return {
    mode: "blocked",
    requestId: created.id,
    message: "Este documento está fora do tratamento vigente ou não pôde ser verificado. O pedido foi registrado na fila de segunda via para conferência, e nada foi enviado ao cliente.",
  };
}

export async function finishStaffResend(
  requestId: string,
  states: string[],
): Promise<void> {
  const accepted = states.includes("provider_accepted");
  const status = accepted ? "provider_accepted" : states.every((s) => s === "failed" || s === "simulated") ? "failed" : "unknown";
  await db.execute(sql`UPDATE clinical_document_reissue_requests
    SET request_status=${status},delivery_status=${status},
        delivery_completed_at=CASE WHEN ${accepted} THEN NOW() ELSE delivery_completed_at END,
        delivery_result=${accepted ? "Provedor aceitou o envio manual." : "Nenhum canal confirmou o envio manual; confira antes de repetir."},
        updated_at=NOW()
    WHERE id=${requestId}::bigint AND request_status='delivery_pending'`);
}
