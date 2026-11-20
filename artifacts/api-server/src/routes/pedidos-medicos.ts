import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { clinicalAccessGrantsTable, db } from "@workspace/db";
import { currentResponsibleDoctor, isPlatformOwner } from "../lib/clinical-access";
import { PEDIDO_KINDS, PEDIDO_LABEL, ASAAS_MIN_VALUE, isEligibleDoctor, resolvePedidoAmount, type PedidoKind } from "../lib/pedido-medico";
import { setSetting } from "../lib/secure-settings";
import { requireCollaborator } from "./collaborator";
import { readReissuePolicy, recordClinicalDocumentReissueEvent } from "../lib/clinical-document-reissue-policy";
import { deliverApprovedClinicalDocumentReissue } from "../lib/atendimento-telegram-reenvio";
import { asaasGetCharge } from "../lib/asaas";
import { resolveReissueReview } from "../lib/clinical-document-reissue-review";

// ===========================================================================
// FILA DO MEDICO para pedidos pagos pelo cliente. Quem age e sempre um medico
// logado: o destino, o responsavel tecnico da unidade ou nenhum (404). A emissao
// do documento continua no Cockpit, com o certificado do proprio medico.
// ===========================================================================

const router: IRouter = Router();

export interface Row {
  id: number; client_id: number; empresa_id: number; location_id: number; kind: PedidoKind;
  details: string; status: string; amount: string | null; paid_at: string | null;
  assigned_professional_id: number | null; assigned_reason: string | null;
  decision_note: string | null; issued_reference: string | null; refund_pending: boolean; created_at: string;
  decided_by_professional_id?: number | null;
  isento_beneficio_id?: number | null; draft_items?: string | null; doc_pdf_id?: number | null;
  doc_send_status?: string | null; doc_sent_at?: string | null; doc_send_error?: string | null;
}

function actorId(req: Request): number | null {
  const id = Number(req.collaborator?.professionalId);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function responsibleScopes(actor: number): Promise<Array<{ locationId: number; empresaId: number }>> {
  const grants = await db.select({
    locationId: clinicalAccessGrantsTable.locationId,
    empresaId: clinicalAccessGrantsTable.empresaId,
  }).from(clinicalAccessGrantsTable).where(and(
    eq(clinicalAccessGrantsTable.professionalId, actor),
    eq(clinicalAccessGrantsTable.isResponsibleDoctor, true),
  ));
  const valid: Array<{ locationId: number; empresaId: number }> = [];
  for (const g of grants) {
    const doctor = await currentResponsibleDoctor(g.locationId, g.empresaId);
    if (doctor?.id === actor) valid.push(g);
  }
  return valid;
}

type Role = "destino" | "responsavel" | null;
async function roleOn(actor: number, row: Row): Promise<Role> {
  if (row.assigned_professional_id === actor) return "destino";
  const scopes = await responsibleScopes(actor);
  return scopes.some((s) => s.locationId === row.location_id && s.empresaId === row.empresa_id)
    ? "responsavel" : null;
}

export async function loadAuthorized(req: Request, res: Response): Promise<{ row: Row; actor: number; role: Exclude<Role, null> } | null> {
  const actor = actorId(req);
  if (!actor) { res.status(401).json({ error: "Faça login de colaborador." }); return null; }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Pedido inválido." }); return null; }
  const found = await db.execute(sql`SELECT * FROM client_medical_requests WHERE id = ${id}`);
  const row = found.rows[0] as unknown as Row | undefined;
  const role = row ? await roleOn(actor, row) : null;
  // Pedido de outra unidade/medico e inexistente para quem nao tem papel nele.
  if (!row || !role) { res.status(404).json({ error: "Pedido não encontrado." }); return null; }
  return { row, actor, role };
}

router.get("/pedidos-medicos/fila", requireCollaborator, async (req, res): Promise<void> => {
  const actor = actorId(req);
  if (!actor) { res.status(401).json({ error: "Faça login de colaborador." }); return; }
  try {
    const scopes = await responsibleScopes(actor);
    const found = await db.execute(sql`
      SELECT r.*, c.name AS client_name, d.token AS doc_token FROM client_medical_requests r
        JOIN clients c ON c.id = r.client_id
        LEFT JOIN exam_request_pdfs d ON d.id = r.doc_pdf_id
       WHERE r.status IN ('pago','em_analise')
          OR (r.status = 'emitido' AND r.updated_at > NOW() - INTERVAL '30 days')
       ORDER BY r.created_at ASC LIMIT 500`);
    const rows = (found.rows as unknown as Array<Row & { client_name: string; doc_token: string | null }>).filter((r) =>
      r.assigned_professional_id === actor ||
      scopes.some((s) => s.locationId === r.location_id && s.empresaId === r.empresa_id));
    res.json(rows.map((r) => ({
      id: r.id, kind: r.kind, kindLabel: PEDIDO_LABEL[r.kind], clientId: r.client_id,
      clientName: r.client_name, details: r.details, status: r.status,
      paidAt: r.paid_at, createdAt: r.created_at,
      isento: r.isento_beneficio_id != null, draftItems: r.draft_items,
      docToken: r.doc_token ?? null, docSendStatus: r.doc_send_status, docSentAt: r.doc_sent_at, docSendError: r.doc_send_error,
      assignedProfessionalId: r.assigned_professional_id, assignedReason: r.assigned_reason,
      asResponsible: r.assigned_professional_id !== actor,
    })));
  } catch (err) {
    req.log.error({ err: String(err) }, "Erro ao listar fila de pedidos médicos");
    res.status(500).json({ error: "Não foi possível carregar a fila." });
  }
});

router.post("/pedidos-medicos/:id/iniciar", requireCollaborator, async (req, res): Promise<void> => {
  const ctx = await loadAuthorized(req, res);
  if (!ctx) return;
  // O responsavel tecnico so assume um pedido SEM destino; nunca toma o de outro medico.
  const canStart = ctx.role === "destino" || ctx.row.assigned_professional_id === null;
  if (!canStart) { res.status(403).json({ error: "Este pedido está com outro médico." }); return; }
  const upd = await db.execute(sql`
    UPDATE client_medical_requests
       SET status = 'em_analise', assigned_professional_id = ${ctx.actor},
           assigned_reason = COALESCE(assigned_reason, 'responsavel_tecnico'), updated_at = NOW()
     WHERE id = ${ctx.row.id} AND status = 'pago'
       AND (assigned_professional_id = ${ctx.actor} OR assigned_professional_id IS NULL)
 RETURNING id`);
  if (upd.rows.length === 0) { res.status(409).json({ error: "O pedido não está mais aguardando análise." }); return; }
  res.json({ id: ctx.row.id, status: "em_analise" });
});

const EmitBody = z.object({ reference: z.string().trim().max(200).optional() }).strict();
router.post("/pedidos-medicos/:id/emitido", requireCollaborator, async (req, res): Promise<void> => {
  const ctx = await loadAuthorized(req, res);
  if (!ctx) return;
  const body = EmitBody.safeParse(req.body ?? {});
  if (!body.success) { res.status(400).json({ error: "Corpo inválido." }); return; }
  if (ctx.row.kind === "pedido_exames") {
    res.status(422).json({ error: "Pedido de exames só é concluído ao assinar e enviar o documento real." });
    return;
  }
  // Quem encerra e quem assinou: so o medico que esta com o pedido.
  const upd = await db.execute(sql`
    UPDATE client_medical_requests
       SET status = 'emitido', decided_by_professional_id = ${ctx.actor},
           issued_reference = ${body.data.reference ?? null}, updated_at = NOW()
     WHERE id = ${ctx.row.id} AND status = 'em_analise' AND assigned_professional_id = ${ctx.actor}
 RETURNING id`);
  if (upd.rows.length === 0) {
    res.status(409).json({ error: "Só o médico que iniciou a análise pode concluir o pedido em análise." });
    return;
  }
  res.json({ id: ctx.row.id, status: "emitido" });
});

const RefuseBody = z.object({ reason: z.string().trim().min(10).max(1000) }).strict();
router.post("/pedidos-medicos/:id/recusar", requireCollaborator, async (req, res): Promise<void> => {
  const ctx = await loadAuthorized(req, res);
  if (!ctx) return;
  const body = RefuseBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Informe o motivo da recusa (mínimo de 10 caracteres)." }); return; }
  const upd = await db.execute(sql`
    UPDATE client_medical_requests
       SET status = 'recusado', decided_by_professional_id = ${ctx.actor},
           decision_note = ${body.data.reason}, refund_pending = TRUE, updated_at = NOW()
     WHERE id = ${ctx.row.id} AND status IN ('pago','em_analise')
       AND assigned_professional_id = ${ctx.actor}
 RETURNING id`);
  if (upd.rows.length === 0) { res.status(409).json({ error: "Só o médico responsável pelo pedido pode recusá-lo." }); return; }
  // O sistema NAO devolve dinheiro sozinho: fica marcado para a clinica reembolsar.
  res.json({ id: ctx.row.id, status: "recusado", refundPending: true });
});

const ForwardBody = z.object({ professionalId: z.number().int().positive() }).strict();
router.post("/pedidos-medicos/:id/encaminhar", requireCollaborator, async (req, res): Promise<void> => {
  const ctx = await loadAuthorized(req, res);
  if (!ctx) return;
  if (ctx.role !== "responsavel") {
    res.status(403).json({ error: "Somente o médico responsável técnico pode encaminhar." });
    return;
  }
  const body = ForwardBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Informe o médico de destino." }); return; }
  const ok = await isEligibleDoctor(body.data.professionalId, ctx.row.location_id, ctx.row.empresa_id, ctx.row.kind);
  if (!ok) {
    res.status(422).json({ error: "O médico escolhido não está apto nesta unidade (vínculo, liberação ou certificado)." });
    return;
  }
  const upd = await db.execute(sql`
    UPDATE client_medical_requests
       SET assigned_professional_id = ${body.data.professionalId}, assigned_reason = 'encaminhado',
           status = 'pago', updated_at = NOW()
     WHERE id = ${ctx.row.id} AND status IN ('pago','em_analise')
 RETURNING id`);
  if (upd.rows.length === 0) { res.status(409).json({ error: "O pedido já foi concluído." }); return; }
  res.json({ id: ctx.row.id, status: "pago", assignedProfessionalId: body.data.professionalId });
});

// Precos por tipo: so o dono da plataforma (CEO) configura. Sem valor, o cliente nao consegue pedir.
router.get("/pedidos-medicos/precos", requireCollaborator, async (req, res): Promise<void> => {
  const actor = actorId(req);
  if (!actor || !(await isPlatformOwner(actor))) { res.status(403).json({ error: "Acesso restrito ao titular da plataforma." }); return; }
  const out: Record<string, number | null> = {};
  for (const kind of PEDIDO_KINDS) out[kind] = await resolvePedidoAmount(kind);
  res.json({ minimo: ASAAS_MIN_VALUE, valores: out });
});

const PriceBody = z.object({
  receita: z.number().min(ASAAS_MIN_VALUE).max(100000).optional(),
  pedido_exames: z.number().min(ASAAS_MIN_VALUE).max(100000).optional(),
}).strict();
router.put("/pedidos-medicos/precos", requireCollaborator, async (req, res): Promise<void> => {
  const actor = actorId(req);
  if (!actor || !(await isPlatformOwner(actor))) { res.status(403).json({ error: "Acesso restrito ao titular da plataforma." }); return; }
  const body = PriceBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: `Valores devem ser números a partir de R$ ${ASAAS_MIN_VALUE},00.` }); return; }
  for (const kind of PEDIDO_KINDS) {
    const v = body.data[kind];
    if (v !== undefined) await setSetting(`pay.pedidoMedico.${kind}`, String(v));
  }
  const out: Record<string, number | null> = {};
  for (const kind of PEDIDO_KINDS) out[kind] = await resolvePedidoAmount(kind);
  res.json({ minimo: ASAAS_MIN_VALUE, valores: out });
});

const DocumentTypesBody = z.object({
  prescricao: z.boolean(),
  pedido_exames: z.boolean(),
  atestado: z.boolean(),
  encaminhamento: z.boolean(),
  protocolo: z.boolean(),
  ras_fap: z.boolean(),
  carta_tratamento: z.boolean(),
  documento_assinado: z.boolean(),
}).strict();

const ReissuePolicyBody = z.object({
  enabled: z.boolean(),
  feeCollectionEnabled: z.boolean(),
  requireHumanReview: z.boolean(),
  feeAmount: z.number().min(ASAAS_MIN_VALUE).max(100000),
  documentTypes: DocumentTypesBody,
}).strict();

async function requirePolicyOwner(req: Request, res: Response): Promise<number | null> {
  const actor = actorId(req);
  if (!actor || !(await isPlatformOwner(actor))) {
    res.status(403).json({ error: "Acesso restrito ao titular da plataforma." });
    return null;
  }
  return actor;
}

router.get("/pedidos-medicos/segunda-via/config", requireCollaborator, async (req, res): Promise<void> => {
  const actor = await requirePolicyOwner(req, res);
  if (!actor) return;
  const empresaId = Number(req.query.empresaId);
  const locationId = Number(req.query.locationId);
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0 ||
      !Number.isSafeInteger(locationId) || locationId <= 0) {
    res.status(400).json({ error: "Informe a clínica para consultar a política." });
    return;
  }
  res.json(await readReissuePolicy(empresaId, locationId));
});

router.put("/pedidos-medicos/segunda-via/config", requireCollaborator, async (req, res): Promise<void> => {
  const actor = await requirePolicyOwner(req, res);
  if (!actor) return;
  const body = ReissuePolicyBody.safeParse(req.body);
  const empresaId = Number(req.query.empresaId);
  const locationId = Number(req.query.locationId);
  if (!body.success || !Number.isSafeInteger(empresaId) || empresaId <= 0 ||
      !Number.isSafeInteger(locationId) || locationId <= 0) {
    res.status(400).json({ error: "Confira clínica, taxa e controles da segunda via." });
    return;
  }
  try {
    await db.execute(sql`
      INSERT INTO clinical_document_reissue_settings
        (empresa_id, location_id, enabled, fee_collection_enabled, require_human_review,
         fee_amount, document_types, updated_by_professional_id, updated_at)
      VALUES (
        ${empresaId}, ${locationId}, ${body.data.enabled}, ${body.data.feeCollectionEnabled},
        ${body.data.requireHumanReview}, ${body.data.feeAmount},
        ${JSON.stringify(body.data.documentTypes)}::jsonb, ${actor}, NOW()
      )
      ON CONFLICT (empresa_id, location_id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        fee_collection_enabled = EXCLUDED.fee_collection_enabled,
        require_human_review = EXCLUDED.require_human_review,
        fee_amount = EXCLUDED.fee_amount,
        document_types = EXCLUDED.document_types,
        updated_by_professional_id = EXCLUDED.updated_by_professional_id,
        updated_at = NOW()
    `);
    await recordClinicalDocumentReissueEvent({
      empresaId,
      locationId,
      actorProfessionalId: actor,
      eventType: "policy_updated",
      details: body.data,
    });
    res.json(await readReissuePolicy(empresaId, locationId));
  } catch (err) {
    req.log.error({ err: String(err) }, "Erro ao salvar política de segunda via");
    res.status(500).json({ error: "Não foi possível salvar a política." });
  }
});

interface ReissueQueueRow {
  id: string;
  client_id: number;
  client_name: string;
  document_type: string;
  document_label: string;
  original_document_issued_at: string | null;
  requested_at: string;
  requested_by_channel: string;
  request_status: string;
  eligibility_status: string;
  eligibility_reason: string;
  membership_verification: string;
  fee_amount: string | null;
  payment_status: string;
  paid_at: string | null;
  require_human_review: boolean;
  reviewed_by_professional_id: number | null;
  reviewed_at: string | null;
  delivery_channel: string | null;
  delivery_status: string;
  delivery_result: string | null;
  asaas_invoice_url: string | null;
}

router.get("/pedidos-medicos/segunda-via/fila", requireCollaborator, async (req, res): Promise<void> => {
  const actor = await requirePolicyOwner(req, res);
  if (!actor) return;
  const empresaId = Number(req.query.empresaId);
  const locationId = Number(req.query.locationId);
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0 ||
      !Number.isSafeInteger(locationId) || locationId <= 0) {
    res.status(400).json({ error: "Informe a clínica para consultar as solicitações." });
    return;
  }
  try {
    const result = await db.execute(sql`
      SELECT r.id, r.client_id, c.name AS client_name, r.document_type, r.document_label,
             r.original_document_issued_at, r.requested_at, r.requested_by_channel,
             r.request_status, r.eligibility_status, r.eligibility_reason,
             r.membership_verification, r.fee_amount, r.payment_status, r.paid_at,
             r.require_human_review, r.reviewed_by_professional_id, r.reviewed_at,
              r.delivery_channel, r.delivery_status, r.delivery_result, r.asaas_invoice_url
        FROM clinical_document_reissue_requests r
        JOIN clients c ON c.id = r.client_id
       WHERE r.empresa_id = ${empresaId} AND r.location_id = ${locationId}
         AND c.empresa_id = r.empresa_id AND c.location_id = r.location_id
         AND c.deleted_at IS NULL
       ORDER BY r.requested_at DESC, r.id DESC
       LIMIT 500
    `);
    res.json(result.rows as unknown as ReissueQueueRow[]);
  } catch (err) {
    req.log.error({ err: String(err) }, "Erro ao carregar fila de segundas vias");
    res.status(500).json({ error: "Não foi possível carregar as solicitações." });
  }
});

router.post("/pedidos-medicos/segunda-via/:id/aprovar", requireCollaborator, async (req, res): Promise<void> => {
  const actor = await requirePolicyOwner(req, res);
  if (!actor) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "Solicitação inválida." });
    return;
  }
  const body = z.object({
    eligibilityOverride: z.enum(["free_treatment", "fee_required"]).optional(),
    reason: z.string().trim().min(10).max(500).optional(),
  }).strict().safeParse(req.body ?? {});
  if (!body.success || (body.data.eligibilityOverride && !body.data.reason)) {
    res.status(400).json({ error: "Informe o motivo da validação manual." });
    return;
  }
  const updated = await db.execute(sql`
    UPDATE clinical_document_reissue_requests
       SET request_status = 'approved',
           eligibility_status = COALESCE(${body.data.eligibilityOverride ?? null}, eligibility_status),
           membership_verification = CASE
             WHEN ${body.data.eligibilityOverride ?? null} = 'free_member' THEN 'active_paid'
             ELSE membership_verification
           END,
           payment_status = CASE
             WHEN ${body.data.eligibilityOverride ?? null} IN ('free_treatment','free_member')
                  AND asaas_charge_id IS NULL THEN 'not_required'
             ELSE payment_status
           END,
           eligibility_reason = COALESCE(${body.data.reason ?? null}, eligibility_reason),
           review_note = COALESCE(${body.data.reason ?? null}, review_note),
           reviewed_by_professional_id = ${actor},
           reviewed_at = NOW(), updated_at = NOW()
     WHERE id = ${id} AND request_status = 'awaiting_review'
       AND (
         eligibility_status IN ('free_treatment','free_member','fee_required')
         OR (eligibility_status='human_review' AND ${body.data.eligibilityOverride ?? null} IS NOT NULL
             AND ${body.data.reason ?? null} IS NOT NULL)
       )
       AND (
         payment_status IN ('not_required','paid')
         OR (eligibility_status='human_review'
             AND ${body.data.eligibilityOverride ?? null} IN ('free_treatment','free_member')
             AND payment_status='unverified' AND asaas_charge_id IS NULL)
       )
       AND client_consent_at IS NOT NULL AND document_pdf_sha256 IS NOT NULL
    RETURNING id
  `);
  if (!updated.rows.length) {
    res.status(409).json({ error: "A solicitação ainda não passou por todas as verificações obrigatórias." });
    return;
  }
  const scope = await db.execute(sql`SELECT empresa_id,location_id FROM clinical_document_reissue_requests WHERE id=${id}`);
  const requestScope = scope.rows[0] as { empresa_id: number; location_id: number } | undefined;
  if (requestScope) {
    await recordClinicalDocumentReissueEvent({
      requestId: String(id),
      empresaId: requestScope.empresa_id,
      locationId: requestScope.location_id,
      actorProfessionalId: actor,
      eventType: "review_approved",
      details: {
        eligibilityOverride: body.data.eligibilityOverride ?? null,
        reason: body.data.reason ?? null,
      },
    });
  }
  const delivery = await deliverApprovedClinicalDocumentReissue(String(id));
  if (!delivery.sent) {
    res.status(502).json({
      id,
      status: delivery.error === "entrega_ja_iniciada_ou_bloqueada" ? "unknown" : "approved",
      error: delivery.error ?? "Não foi possível confirmar a entrega pelo Telegram.",
    });
    return;
  }
  res.json({ id, status: "provider_accepted" });
});

router.post("/pedidos-medicos/segunda-via/:id/verificar-pagamento", requireCollaborator, async (req, res): Promise<void> => {
  const actor = await requirePolicyOwner(req, res);
  if (!actor) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "Solicitação inválida." });
    return;
  }
  const rows = await db.execute(sql`SELECT r.id,r.asaas_charge_id,r.fee_amount,r.require_human_review,
      r.request_status,r.payment_status,c.asaas_customer_id
    FROM clinical_document_reissue_requests r
    JOIN clients c ON c.id=r.client_id
    WHERE r.id=${id} LIMIT 1`);
  const request = rows.rows[0] as {
    id: string | number; asaas_charge_id: string | null; fee_amount: string | number | null;
    require_human_review: boolean; request_status: string; payment_status: string;
    asaas_customer_id: string | null;
  } | undefined;
  if (!request?.asaas_charge_id || !request.asaas_customer_id) {
    res.status(409).json({ error: "A cobrança ainda não tem referência suficiente para conferência automática." });
    return;
  }
  try {
    const rawCharge = await asaasGetCharge(request.asaas_charge_id) as unknown as {
      id: string; value: number; status: string; externalReference?: string | null;
      customer?: string | null; paymentDate?: string | null; deleted?: boolean;
    };
    if (rawCharge.id !== request.asaas_charge_id ||
        rawCharge.externalReference !== `paxmed_reissue:${id}` ||
        rawCharge.customer !== request.asaas_customer_id ||
        Math.round(Number(rawCharge.value) * 100) !== Math.round(Number(request.fee_amount) * 100)) {
      res.status(409).json({ error: "O provedor retornou dados diferentes dos registrados; a solicitação permanece bloqueada." });
      return;
    }
    if (["RECEIVED", "CONFIRMED"].includes(rawCharge.status)) {
      const paidAt = rawCharge.paymentDate || new Date().toISOString();
      const updated = await db.execute(sql`UPDATE clinical_document_reissue_requests
        SET payment_status='paid',paid_at=${paidAt},
            request_status=CASE WHEN require_human_review THEN 'awaiting_review' ELSE 'approved' END,
            eligibility_reason='Pagamento conferido diretamente no Asaas.',updated_at=NOW()
        WHERE id=${id} AND request_status IN ('awaiting_payment','unknown')
        RETURNING id`);
      await db.execute(sql`UPDATE payments SET status='paid',paid_at=${paidAt}
        WHERE asaas_charge_id=${request.asaas_charge_id}`);
      if (updated.rows.length && !request.require_human_review) {
        const delivery = await deliverApprovedClinicalDocumentReissue(String(id));
        if (!delivery.sent) {
          res.status(502).json({ id, status: "paid_delivery_pending", error: delivery.error });
          return;
        }
        res.json({ id, status: "provider_accepted" });
        return;
      }
      res.json({ id, status: request.require_human_review ? "awaiting_review" : "approved" });
      return;
    }
    if (rawCharge.status === "OVERDUE") {
      await db.execute(sql`UPDATE clinical_document_reissue_requests
        SET payment_status='overdue',eligibility_reason='Cobrança vencida confirmada diretamente no Asaas.',updated_at=NOW()
        WHERE id=${id} AND request_status IN ('awaiting_payment','unknown')`);
      await db.execute(sql`UPDATE payments SET status='overdue' WHERE asaas_charge_id=${request.asaas_charge_id}`);
      res.json({ id, status: "awaiting_payment", paymentStatus: "overdue" });
      return;
    }
    if (rawCharge.deleted || ["DELETED", "REFUNDED", "CHARGEBACK_REQUESTED"].includes(rawCharge.status)) {
      await db.execute(sql`UPDATE clinical_document_reissue_requests
        SET request_status='cancelled',payment_status='cancelled',delivery_share_expires_at=NOW(),
            eligibility_reason='Cobrança cancelada ou estornada no Asaas.',updated_at=NOW()
        WHERE id=${id}`);
      await db.execute(sql`UPDATE payments SET status='cancelled' WHERE asaas_charge_id=${request.asaas_charge_id}`);
      res.json({ id, status: "cancelled" });
      return;
    }
    res.json({ id, status: request.request_status, paymentStatus: request.payment_status });
  } catch (err) {
    req.log.error({ err: String(err), requestId: id }, "Falha na conferência de pagamento da segunda via");
    res.status(502).json({ error: "Não foi possível consultar o Asaas agora; nenhuma liberação foi feita." });
  }
});

router.post("/pedidos-medicos/segunda-via/:id/resolver-revisao", requireCollaborator, async (req, res): Promise<void> => {
  const actor = await requirePolicyOwner(req, res);
  if (!actor) return;
  const id = Number(req.params.id);
  const body = z.object({
    resolution: z.enum(["free_treatment", "fee_required"]),
    reason: z.string().trim().min(10).max(500),
  }).strict().safeParse(req.body);
  if (!Number.isSafeInteger(id) || id <= 0 || !body.success) {
    res.status(400).json({ error: "Informe o resultado da conferência e o motivo (mínimo de 10 caracteres)." });
    return;
  }
  const result = await resolveReissueReview({
    requestId: id,
    actorProfessionalId: actor,
    resolution: body.data.resolution,
    reason: body.data.reason,
  });
  if (!result.ok) {
    res.status(result.httpStatus).json({ error: result.error });
    return;
  }
  res.json({ id, status: result.status, feeAmount: result.feeAmount });
});

router.post("/pedidos-medicos/segunda-via/:id/recusar", requireCollaborator, async (req, res): Promise<void> => {
  const actor = await requirePolicyOwner(req, res);
  if (!actor) return;
  const id = Number(req.params.id);
  const body = z.object({ reason: z.string().trim().min(5).max(500) }).strict().safeParse(req.body);
  if (!Number.isSafeInteger(id) || id <= 0 || !body.success) {
    res.status(400).json({ error: "Informe a solicitação e o motivo da recusa." });
    return;
  }
  const updated = await db.execute(sql`
    UPDATE clinical_document_reissue_requests
       SET request_status = 'denied', eligibility_reason = ${body.data.reason},
           reviewed_by_professional_id = ${actor}, reviewed_at = NOW(), updated_at = NOW()
     WHERE id = ${id} AND request_status IN ('requested','awaiting_confirmation','awaiting_payment','awaiting_review','approved')
       AND (
         (asaas_charge_id IS NULL AND payment_provider IS NULL)
         OR payment_status IN ('paid','cancelled','failed')
       )
    RETURNING id
  `);
  if (!updated.rows.length) {
    res.status(409).json({ error: "A solicitação não pode ser recusada agora. Se há cobrança pendente, confira o pagamento no Asaas e cancele a cobrança antes de recusar." });
    return;
  }
  const scope = await db.execute(sql`SELECT empresa_id,location_id FROM clinical_document_reissue_requests WHERE id=${id}`);
  const requestScope = scope.rows[0] as { empresa_id: number; location_id: number } | undefined;
  if (requestScope) {
    await recordClinicalDocumentReissueEvent({
      requestId: String(id),
      empresaId: requestScope.empresa_id,
      locationId: requestScope.location_id,
      actorProfessionalId: actor,
      eventType: "review_denied",
      details: { reason: body.data.reason },
    });
  }
  res.json({ id, status: "denied" });
});

export default router;
