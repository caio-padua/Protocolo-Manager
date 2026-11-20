import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { brtISODate } from "./brt";
import { getIssuedDocument, type ClinicalDocumentType } from "./clinical-document-share";

export type MembershipVerification =
  | "active_paid"
  | "inactive_or_unpaid"
  | "unavailable";

export type ReissueEligibility =
  | "free_treatment"
  | "free_member"
  | "fee_required"
  | "human_review";

export interface ReissuePolicy {
  enabled: boolean;
  feeCollectionEnabled: boolean;
  requireHumanReview: boolean;
  feeAmount: number;
  documentTypes: Record<string, boolean>;
}

export interface EligibilityResult {
  eligibility: ReissueEligibility;
  reason: string;
  membershipVerification: MembershipVerification;
}

export interface CreateReissueRequestInput {
  clientId: number;
  empresaId: number;
  locationId: number;
  documentType: ClinicalDocumentType | "protocolo" | "ras_fap" | "carta_tratamento" | "documento_assinado" | "nao_identificado";
  documentId: number | null;
  requestedByChannel: "telegram" | "client_portal" | "staff";
  clientConsent: boolean;
  membershipVerification?: MembershipVerification;
  operationKey: string;
}

export interface CreatedReissueRequest {
  id: string;
  status: string;
  eligibility: ReissueEligibility;
  reason: string;
  paymentStatus: string;
  feeAmount: number | null;
  documentLabel: string;
  originalDocumentIssuedAt: string | null;
  documentHash: string | null;
}

const DEFAULT_DOCUMENT_TYPES: Record<string, boolean> = {
  prescricao: true,
  pedido_exames: true,
  atestado: true,
  encaminhamento: true,
  protocolo: true,
  ras_fap: true,
  carta_tratamento: true,
  documento_assinado: true,
};

export const DEFAULT_REISSUE_POLICY: ReissuePolicy = {
  enabled: false,
  feeCollectionEnabled: false,
  requireHumanReview: true,
  feeAmount: 15,
  documentTypes: DEFAULT_DOCUMENT_TYPES,
};

function parseIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export async function readReissuePolicy(empresaId: number, locationId: number): Promise<ReissuePolicy> {
  const result = await db.execute(sql`
    SELECT enabled, fee_collection_enabled, require_human_review, fee_amount, document_types
      FROM clinical_document_reissue_settings
     WHERE empresa_id = ${empresaId} AND location_id = ${locationId}
     LIMIT 1
  `);
  const row = result.rows[0] as {
    enabled?: boolean;
    fee_collection_enabled?: boolean;
    require_human_review?: boolean;
    fee_amount?: number | string;
    document_types?: Record<string, unknown>;
  } | undefined;
  if (!row) return { ...DEFAULT_REISSUE_POLICY, documentTypes: { ...DEFAULT_DOCUMENT_TYPES } };

  const amount = Number(row.fee_amount);
  const rawTypes = row.document_types && typeof row.document_types === "object" ? row.document_types : {};
  return {
    enabled: row.enabled === true,
    feeCollectionEnabled: row.fee_collection_enabled === true,
    requireHumanReview: row.require_human_review !== false,
    feeAmount: Number.isFinite(amount) && amount >= 5 ? amount : DEFAULT_REISSUE_POLICY.feeAmount,
    documentTypes: Object.fromEntries(
      Object.keys(DEFAULT_DOCUMENT_TYPES).map((key) => [key, rawTypes[key] !== false]),
    ),
  };
}

export async function recordClinicalDocumentReissueEvent(input: {
  requestId?: string | null;
  empresaId: number;
  locationId: number;
  actorProfessionalId?: number | null;
  eventType: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await db.execute(sql`INSERT INTO clinical_document_reissue_events
    (request_id,empresa_id,location_id,actor_professional_id,event_type,details)
    VALUES (${input.requestId ?? null}::bigint,${input.empresaId},${input.locationId},
      ${input.actorProfessionalId ?? null},${input.eventType},${JSON.stringify(input.details ?? {})}::jsonb)`);
}

export async function evaluateReissueEligibility(
  clientId: number,
  empresaId: number,
  membershipVerification: MembershipVerification = "unavailable",
): Promise<EligibilityResult> {
  const today = brtISODate();
  const protocols = await db.execute(sql`
    SELECT status, start_date, end_date
      FROM protocols
     WHERE client_id = ${clientId} AND empresa_id = ${empresaId}
  `);
  const rows = protocols.rows as Array<{ status?: string; start_date?: unknown; end_date?: unknown }>;
  const active = rows.filter((row) => row.status === "active");
  if (active.length > 0) {
    const parsed = active.map((row) => ({
      start: parseIsoDate(row.start_date),
      end: parseIsoDate(row.end_date),
    }));
    if (parsed.some((range) => !range.start || !range.end || range.end < range.start)) {
      return {
        eligibility: "human_review",
        reason: "Há protocolo ativo sem datas de vigência completas e válidas.",
        membershipVerification,
      };
    }
    if (parsed.some((range) => range.start! <= today && range.end! >= today)) {
      return {
        eligibility: "free_treatment",
        reason: "Existe protocolo ativo dentro das datas de vigência registradas.",
        membershipVerification,
      };
    }
  }

  if (membershipVerification === "active_paid") {
    return {
      eligibility: "free_member",
      reason: "Assinatura PaxMed Members ativa e paga verificada.",
      membershipVerification,
    };
  }
  if (membershipVerification === "unavailable") {
    return {
      eligibility: "human_review",
      reason: "Não há fonte disponível para confirmar assinatura PaxMed Members e pagamento.",
      membershipVerification,
    };
  }
  return {
    eligibility: "fee_required",
    reason: "Não há tratamento vigente nem assinatura PaxMed Members ativa e paga.",
    membershipVerification,
  };
}

export async function createReissueRequest(
  input: CreateReissueRequestInput,
): Promise<CreatedReissueRequest> {
  const operationKey = input.operationKey;
  const policy = await readReissuePolicy(input.empresaId, input.locationId);
  const supportedType = input.documentType !== "nao_identificado";
  const document = supportedType && input.documentId
    ? await getIssuedDocument(input.documentType as ClinicalDocumentType, input.documentId)
    : null;

  let documentLabel = document?.label ?? "Documento não localizado ou sem arquivo original recuperável";
  let issuedAt = document?.issuedAt ?? null;
  let documentHash: string | null = null;
  let originalIsValid = false;
  let originalFailure = "O documento original não foi encontrado.";

  if (document) {
    const bytes = typeof document.pdfData === "string" ? Buffer.from(document.pdfData, "base64") : Buffer.alloc(0);
    if (document.clientId !== input.clientId || document.empresaId !== input.empresaId ||
        document.locationId !== input.locationId) {
      originalFailure = "O documento não pertence ao cliente e à clínica desta solicitação.";
    } else if (document.status !== "emitted" ||
        (input.documentType !== "documento_assinado" && !document.professionalId)) {
      originalFailure = "O documento não possui emissão confirmada e profissional identificado.";
    } else if (!document.issuedAt) {
      originalFailure = "A data original de emissão do documento não está registrada.";
    } else if ((input.documentType === "prescricao" || input.documentType === "documento_assinado") &&
        document.signatureStatus !== "signed") {
      originalFailure = "A assinatura da prescrição não pôde ser confirmada.";
    } else if (bytes.length === 0 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      originalFailure = "O arquivo original está ausente ou não é um PDF válido.";
    } else {
      documentHash = createHash("sha256").update(bytes).digest("hex");
      originalIsValid = true;
      originalFailure = "";
    }
  }

  const memberStatus = input.membershipVerification ?? "unavailable";
  const eligibility = await evaluateReissueEligibility(input.clientId, input.empresaId, memberStatus);
  const typeAllowed = policy.documentTypes[input.documentType] === true;
  const featureEnabled = policy.enabled;
  let finalEligibility: ReissueEligibility = eligibility.eligibility;
  let reason = eligibility.reason;
  let requestStatus = "awaiting_review";
  let paymentStatus = "unverified";
  let feeAmount: number | null = null;
  let consentAt: string | null = null;

  if (!originalIsValid) {
    finalEligibility = "human_review";
    reason = originalFailure;
  } else if (!featureEnabled) {
    finalEligibility = "human_review";
    reason = "As solicitações de segunda via estão desativadas para esta clínica.";
  } else if (!typeAllowed) {
    finalEligibility = "human_review";
    reason = "Este tipo de documento está desativado para segunda via.";
  } else if (eligibility.eligibility === "human_review") {
    finalEligibility = "human_review";
    reason = eligibility.reason;
  } else if (eligibility.eligibility === "fee_required") {
    feeAmount = policy.feeAmount;
    if (!input.clientConsent) {
      paymentStatus = "awaiting_consent";
      requestStatus = "awaiting_confirmation";
      reason = "O cliente ainda não confirmou a taxa apresentada.";
    } else {
      consentAt = new Date().toISOString();
      if (policy.feeCollectionEnabled) {
        paymentStatus = "pending";
        requestStatus = "awaiting_payment";
        reason = "Aguardando confirmação verificável do pagamento.";
      } else {
        paymentStatus = "unverified";
        reason = "A criação de cobranças está desativada para esta clínica.";
      }
    }
  } else {
    finalEligibility = eligibility.eligibility;
    paymentStatus = "not_required";
    consentAt = input.clientConsent ? new Date().toISOString() : null;
    requestStatus = !input.clientConsent
      ? "awaiting_confirmation"
      : policy.requireHumanReview ? "awaiting_review" : "approved";
    reason = eligibility.reason;
  }

  const inserted = await db.execute(sql`
    INSERT INTO clinical_document_reissue_requests (
      client_id, empresa_id, location_id, document_type, document_id, document_label,
      original_document_issued_at, requested_by_channel, request_status, eligibility_status,
      eligibility_reason, membership_verification, fee_amount, payment_status, client_consent_at,
      require_human_review, document_pdf_sha256, operation_key, updated_at
    ) VALUES (
      ${input.clientId}, ${input.empresaId}, ${input.locationId}, ${input.documentType},
      ${input.documentId === null ? null : String(input.documentId)}, ${documentLabel},
      ${issuedAt}, ${input.requestedByChannel}, ${requestStatus}, ${finalEligibility},
      ${reason}, ${memberStatus}, ${feeAmount}, ${paymentStatus}, ${consentAt},
      ${policy.requireHumanReview}, ${documentHash}, ${operationKey}::uuid, NOW()
    )
    ON CONFLICT (operation_key) DO UPDATE SET operation_key = EXCLUDED.operation_key
    RETURNING id, (xmax = 0) AS created, request_status, eligibility_status,
      eligibility_reason, payment_status, fee_amount, document_label,
      original_document_issued_at, document_pdf_sha256
  `);
  const saved = inserted.rows[0] as {
    id: string | number; created: boolean; request_status: string;
    eligibility_status: ReissueEligibility; eligibility_reason: string;
    payment_status: string; fee_amount: string | number | null;
    document_label: string; original_document_issued_at: string | null;
    document_pdf_sha256: string | null;
  };
  const id = String(saved.id);
  if (saved.created) {
    await recordClinicalDocumentReissueEvent({
      requestId: id,
      empresaId: input.empresaId,
      locationId: input.locationId,
      eventType: "requested",
      details: {
        channel: input.requestedByChannel,
        documentType: input.documentType,
        documentId: input.documentId,
        originalFound: originalIsValid,
        eligibility: saved.eligibility_status,
        status: saved.request_status,
      },
    });
  }
  return {
    id,
    status: saved.request_status,
    eligibility: saved.eligibility_status,
    reason: saved.eligibility_reason,
    paymentStatus: saved.payment_status,
    feeAmount: saved.fee_amount === null ? null : Number(saved.fee_amount),
    documentLabel: saved.document_label,
    originalDocumentIssuedAt: saved.original_document_issued_at,
    documentHash: saved.document_pdf_sha256,
  };
}

export async function confirmClinicalDocumentReissueRequest(input: {
  requestId: string;
  clientId: number;
  empresaId: number;
  locationId: number;
  confirmationMessageId: number;
}): Promise<{ id: string; status: string; paymentStatus: string; feeAmount: number | null } | null> {
  const policy = await readReissuePolicy(input.empresaId, input.locationId);
  const result = await db.execute(sql`
    UPDATE clinical_document_reissue_requests
       SET client_consent_at = COALESCE(client_consent_at, NOW()),
           client_confirmation_inbox_id = COALESCE(client_confirmation_inbox_id, ${input.confirmationMessageId}),
           request_status = CASE
             WHEN eligibility_status IN ('free_treatment','free_member') AND document_pdf_sha256 IS NOT NULL
               THEN CASE WHEN require_human_review THEN 'awaiting_review' ELSE 'approved' END
             WHEN eligibility_status = 'fee_required' AND document_pdf_sha256 IS NOT NULL
                  AND ${policy.feeCollectionEnabled}
               THEN 'awaiting_payment'
             ELSE 'awaiting_review'
           END,
           payment_status = CASE
             WHEN eligibility_status IN ('free_treatment','free_member') AND document_pdf_sha256 IS NOT NULL
               THEN 'not_required'
             WHEN eligibility_status = 'fee_required' AND document_pdf_sha256 IS NOT NULL
                  AND ${policy.feeCollectionEnabled}
               THEN 'unverified'
             ELSE payment_status
           END,
           eligibility_reason = CASE
             WHEN eligibility_status = 'fee_required' AND NOT ${policy.feeCollectionEnabled}
               THEN 'O cliente confirmou, mas a criação de cobranças está desativada.'
             ELSE eligibility_reason
           END,
           updated_at = NOW()
     WHERE id = ${input.requestId}::bigint
       AND client_id = ${input.clientId}
       AND empresa_id = ${input.empresaId}
       AND location_id = ${input.locationId}
       AND (request_status = 'awaiting_confirmation' OR client_confirmation_inbox_id = ${input.confirmationMessageId})
       AND document_pdf_sha256 IS NOT NULL
    RETURNING id, request_status, payment_status, fee_amount
  `);
  const row = result.rows[0] as {
    id: string | number;
    request_status: string;
    payment_status: string;
    fee_amount: string | number | null;
  } | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    status: row.request_status,
    paymentStatus: row.payment_status,
    feeAmount: row.fee_amount === null ? null : Number(row.fee_amount),
  };
}
