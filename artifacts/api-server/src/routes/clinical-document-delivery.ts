import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db, clientsTable, collaboratorAuditTable,
} from "@workspace/db";
import { z } from "zod";
import { requireCollaborator } from "./collaborator";
import { ClinicalIdentityError, resolveClinicalEmitter, resolveClinicalMember } from "../lib/clinical-emitter";
import { absoluteBaseUrl } from "../lib/messaging/base-url";
import { enviarMensagemPaxter, type PaxterCanal, type PaxterDoc } from "../lib/messaging/index.js";
import { authorizedPrescription } from "./prescription-delivery";
import { finishStaffResend, gateStaffResend } from "../lib/clinical-document-reissue-review";
import {
  criarTokenClinicalShare,
  getIssuedDocument,
  hashClinicalShareToken,
  type ClinicalDocumentType,
} from "../lib/clinical-document-share";

const router = Router();
const publicRouter = Router();
const ResendBody = z.object({
  documentType: z.enum([
    "prescricao", "pedido_exames", "atestado", "encaminhamento",
    "protocolo", "ras_fap", "carta_tratamento", "documento_assinado",
  ]),
  documentId: z.number().int().positive(),
  clientId: z.number().int().positive(),
  channels: z.array(z.enum(["EMAIL", "WHATSAPP", "TELEGRAM"])).min(1).max(3),
  confirmed: z.literal(true),
  operationKey: z.string().uuid(),
}).strict().refine((value) => new Set(value.channels).size === value.channels.length, {
  message: "Selecione cada canal apenas uma vez.",
});

type DocumentType = ClinicalDocumentType;
type Channel = "EMAIL" | "WHATSAPP" | "TELEGRAM";
type ResendState = "requested" | "provider_accepted" | "simulated" | "failed" | "unknown";

function noStore(res: Response) {
  res.set({
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  });
}

function safeFilename(value: string) {
  return (value || "documento-clinico.pdf").replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 120);
}

function maskedRecipient(channel: Channel, value: string) {
  if (channel === "EMAIL") {
    const [name, domain] = value.split("@");
    return `${(name || "").slice(0, 1)}***@${domain || "***"}`;
  }
  return `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

router.use(requireCollaborator);

router.get("/clinical-document-reissues/client/:clientId", async (req, res) => {
  noStore(res);
  const clientId = Number(req.params.clientId);
  try {
    const identity = await resolveClinicalMember(req, clientId);
    const result = await db.execute(sql`SELECT id,document_type,document_label,original_document_issued_at,
        requested_at,requested_by_channel,request_status,eligibility_status,eligibility_reason,
        fee_amount,payment_status,paid_at,reviewed_at,delivery_channel,delivery_status,delivery_result
      FROM clinical_document_reissue_requests
      WHERE client_id=${identity.client.id} AND empresa_id=${identity.clinic.empresaId}
        AND location_id=${identity.clinic.id}
      ORDER BY requested_at DESC,id DESC LIMIT 100`);
    res.json(result.rows);
  } catch (error) {
    if (error instanceof ClinicalIdentityError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    req.log.error({ err: String(error), clientId }, "Falha ao carregar histórico de segundas vias do cliente");
    res.status(500).json({ error: "Não foi possível carregar o histórico deste cliente." });
  }
});

router.get("/clinical-documents/:documentType/:documentId/pdf", async (req, res) => {
  noStore(res);
  const type = req.params.documentType;
  const documentId = Number(req.params.documentId);
  if (!["prescricao", "pedido_exames", "atestado", "encaminhamento", "protocolo",
      "ras_fap", "carta_tratamento", "documento_assinado"].includes(type) ||
    !Number.isSafeInteger(documentId) || documentId <= 0) {
    res.status(404).json({ error: "Documento indisponível." });
    return;
  }
  const document = await getIssuedDocument(type as DocumentType, documentId);
  const unsignedPrescription = type === "prescricao" && document?.status === "emitted_unsigned";
  if (!document || !document.clientId || (document.status !== "emitted" && !unsignedPrescription) ||
    document.professionalId === null || document.professionalId === undefined || !document.pdfData) {
    res.status(404).json({ error: "Documento indisponível." });
    return;
  }
  let identity;
  try {
    identity = type === "documento_assinado"
      ? await resolveClinicalMember(req, document.clientId)
      : await resolveClinicalEmitter(req, document.clientId);
  } catch (error) {
    if (error instanceof ClinicalIdentityError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
  if (document.professionalId !== null && document.professionalId !== identity.professional.id) {
    res.status(404).json({ error: "Documento indisponível." });
    return;
  }
  if (type === "prescricao" && document.prescriptionId) {
    const { identity: prescriptionIdentity } = await authorizedPrescription(req, document.prescriptionId);
    if (prescriptionIdentity.client.id !== identity.client.id ||
      prescriptionIdentity.clinic.id !== identity.clinic.id) {
      res.status(404).json({ error: "Documento indisponível." });
      return;
    }
  }
  const [client] = await db.select().from(clientsTable)
    .where(and(
      eq(clientsTable.id, identity.client.id),
      eq(clientsTable.empresaId, identity.clinic.empresaId),
      eq(clientsTable.locationId, identity.clinic.id),
    )).limit(1);
  if (!client) {
    res.status(404).json({ error: "Documento indisponível." });
    return;
  }
  const bytes = Buffer.from(document.pdfData, "base64");
  if (!bytes.length) {
    res.status(404).json({ error: "Documento indisponível." });
    return;
  }
  const disposition = req.query.download === "1" ? "attachment" : "inline";
  res.type("application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename="${safeFilename(document.fileName || `${document.label}.pdf`)}"`);
  res.send(bytes);
});

router.get("/clinical-documents/delivery-targets/:clientId", async (req, res) => {
  noStore(res);
  let identity;
  try {
    identity = await resolveClinicalEmitter(req, Number(req.params.clientId));
  } catch (error) {
    if (error instanceof ClinicalIdentityError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
  const [client] = await db.select().from(clientsTable)
    .where(and(
      eq(clientsTable.id, identity.client.id),
      eq(clientsTable.empresaId, identity.clinic.empresaId),
      eq(clientsTable.locationId, identity.clinic.id),
    )).limit(1);
  if (!client) {
    res.status(403).json({ error: "O cliente não pertence à clínica autenticada." });
    return;
  }
  const targets = [
    client.email?.trim() ? { channel: "EMAIL", recipient: client.email.trim() } : null,
    client.phone?.trim() ? { channel: "WHATSAPP", recipient: client.phone.trim() } : null,
    client.telegramChatId?.trim() ? { channel: "TELEGRAM", recipient: client.telegramChatId.trim() } : null,
  ].filter((target): target is { channel: Channel; recipient: string } => target !== null);
  res.json({ targets, manual: { instagram: client.instagram?.trim() || null } });
});

router.get("/clinical-documents/delivery-history/:documentType/:documentId", async (req, res) => {
  noStore(res);
  const type = req.params.documentType;
  const documentId = Number(req.params.documentId);
  if (!["prescricao", "pedido_exames", "atestado", "encaminhamento", "protocolo",
      "ras_fap", "carta_tratamento", "documento_assinado"].includes(type) ||
    !Number.isSafeInteger(documentId) || documentId <= 0) {
    res.status(404).json({ error: "Histórico indisponível." });
    return;
  }
  const document = await getIssuedDocument(type as DocumentType, documentId);
  const unsignedPrescription = type === "prescricao" && document?.status === "emitted_unsigned";
  if (!document || !document.clientId ||
    (document.status !== "emitted" && !unsignedPrescription) || !document.professionalId) {
    res.status(404).json({ error: "Histórico indisponível." });
    return;
  }
  let identity;
  try {
    identity = type === "documento_assinado"
      ? await resolveClinicalMember(req, document.clientId)
      : await resolveClinicalEmitter(req, document.clientId);
  } catch (error) {
    if (error instanceof ClinicalIdentityError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
  if (document.professionalId !== null && document.professionalId !== identity.professional.id) {
    res.status(404).json({ error: "Histórico indisponível." });
    return;
  }
  const [client] = await db.select().from(clientsTable)
    .where(and(
      eq(clientsTable.id, identity.client.id),
      eq(clientsTable.empresaId, identity.clinic.empresaId),
      eq(clientsTable.locationId, identity.clinic.id),
    )).limit(1);
  if (!client) {
    res.status(404).json({ error: "Histórico indisponível." });
    return;
  }
  const rows = await db.select({
    id: collaboratorAuditTable.id,
    createdAt: collaboratorAuditTable.createdAt,
    detail: collaboratorAuditTable.detail,
  }).from(collaboratorAuditTable)
    .where(and(
      eq(collaboratorAuditTable.action, "clinical_document_resend"),
      eq(collaboratorAuditTable.professionalId, identity.professional.id),
      sql`${collaboratorAuditTable.detail} ->> 'empresaId' = ${String(identity.clinic.empresaId)}`,
      sql`${collaboratorAuditTable.detail} ->> 'clinicId' = ${String(identity.clinic.id)}`,
      sql`${collaboratorAuditTable.detail} ->> 'clientId' = ${String(identity.client.id)}`,
      sql`${collaboratorAuditTable.detail} ->> 'documentType' = ${type}`,
      sql`${collaboratorAuditTable.detail} ->> 'documentId' = ${String(documentId)}`,
    ))
    .orderBy(desc(collaboratorAuditTable.createdAt))
    .limit(25);
  res.json({
    deliveries: rows.map((row) => {
      const detail = row.detail as Record<string, unknown>;
      return {
        id: row.id,
        createdAt: row.createdAt,
        channel: detail.channel,
        state: detail.state,
        recipientMasked: detail.recipientMasked,
        expiresAt: detail.expiresAt,
        completedAt: detail.completedAt,
      };
    }),
  });
});

router.post("/clinical-documents/resend", async (req, res) => {
  noStore(res);
  const parsed = ResendBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Confira o documento, os canais e a confirmação de reenvio." });
    return;
  }
  const input = parsed.data;
  let identity;
  try {
    identity = input.documentType === "documento_assinado"
      ? await resolveClinicalMember(req, input.clientId)
      : await resolveClinicalEmitter(req, input.clientId);
  } catch (error) {
    if (error instanceof ClinicalIdentityError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
  const document = await getIssuedDocument(input.documentType, input.documentId);
  if (!document || document.clientId !== identity.client.id ||
    (document.professionalId !== null && document.professionalId !== identity.professional.id) ||
    document.status !== "emitted" || !document.pdfData) {
    res.status(404).json({ error: "O documento emitido não pertence ao cliente selecionado ou não está disponível." });
    return;
  }
  if (input.documentType === "prescricao" && document.prescriptionId) {
    const { identity: prescriberIdentity } = await authorizedPrescription(req, document.prescriptionId);
    if (prescriberIdentity.client.id !== identity.client.id ||
      prescriberIdentity.clinic.id !== identity.clinic.id) {
      res.status(403).json({ error: "A prescrição não está no escopo clínico autenticado." });
      return;
    }
  }

  const staffGate = await gateStaffResend({
    clientId: identity.client.id,
    empresaId: identity.clinic.empresaId,
    locationId: identity.clinic.id,
    documentType: input.documentType,
    documentId: input.documentId,
    channels: input.channels,
    professionalId: identity.professional.id,
    operationKey: input.operationKey,
  });
  if (staffGate.mode === "blocked") {
    res.status(409).json({ error: staffGate.message, reissueRequestId: staffGate.requestId });
    return;
  }

  // Re-read destinations from the database. Browser-supplied phone, e-mail,
  // Telegram chat, or clinic values are never treated as authority.
  const [client] = await db.select().from(clientsTable)
    .where(eq(clientsTable.id, identity.client.id)).limit(1);
  if (!client || client.empresaId !== identity.clinic.empresaId || client.locationId !== identity.clinic.id) {
    res.status(403).json({ error: "O vínculo do cliente com a clínica não está autorizado." });
    return;
  }
  const destinations = {
    EMAIL: client.email?.trim() || "",
    WHATSAPP: client.phone?.trim() || "",
    TELEGRAM: client.telegramChatId?.trim() || "",
  };
  const missing = input.channels.filter((channel) => !destinations[channel]);
  const abandonGate = async () => {
    if (staffGate.mode === "allowed" && !staffGate.replay) {
      await finishStaffResend(staffGate.requestId, ["failed"]).catch(() => undefined);
    }
  };
  if (missing.length) {
    await abandonGate();
    res.status(422).json({ error: `Não há destino cadastrado para: ${missing.join(", ")}. Nenhum envio foi iniciado.` });
    return;
  }

  const share = input.channels.some((channel) => channel === "WHATSAPP" || channel === "TELEGRAM")
    ? criarTokenClinicalShare()
    : null;
  const shareToken = share?.token ?? null;
  const shareTokenHash = share?.tokenHash ?? null;
  const expiresAt = share?.expiresAt ?? null;
  const publicUrl = shareToken ? `${absoluteBaseUrl(req)}/api/clinical-documents/share/${shareToken}` : null;
  const fileName = safeFilename(document.fileName || `${document.label}.pdf`);
  const pdfBuffer = Buffer.from(document.pdfData, "base64");
  if (pdfBuffer.length === 0) {
    await abandonGate();
    res.status(422).json({ error: "O arquivo emitido está vazio; nenhum envio foi iniciado." });
    return;
  }
  const pdfSha256 = createHash("sha256").update(pdfBuffer).digest("hex");

  const doc: PaxterDoc = {
    eyebrow: "Documento clínico emitido",
    titulo: document.label,
    assunto: document.label,
    paragrafos: [
      `Olá, ${identity.client.name}.`,
      "Segue o documento clínico emitido no seu atendimento.",
      ...(publicUrl ? [`Link seguro para consultar o PDF até ${new Date(expiresAt!).toLocaleDateString("pt-BR")}: ${publicUrl}`] : []),
    ],
    ...(publicUrl ? { botao: { label: "Abrir documento seguro", url: publicUrl } } : {}),
    ...(expiresAt ? { notaRodape: "O link seguro expira em sete dias." } : {}),
    anexos: [{
      filename: fileName,
      content: pdfBuffer,
      contentType: "application/pdf",
    }],
  };

  const lockKey = `${identity.clinic.empresaId}:${identity.clinic.id}:${input.documentType}:${input.documentId}`;

  let auditRows: Array<{ id: number; detail: unknown }>;
  try {
    auditRows = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      const existing = await tx.select().from(collaboratorAuditTable)
        .where(and(
          eq(collaboratorAuditTable.action, "clinical_document_resend"),
          eq(collaboratorAuditTable.professionalId, identity.professional.id),
          sql`${collaboratorAuditTable.detail} ->> 'operationKey' = ${input.operationKey}`,
        ));
      if (existing.length) {
        const first = existing[0].detail as Record<string, unknown>;
        const previousChannels = existing.map((row) => (row.detail as Record<string, unknown>).channel).sort();
        const requestedChannels = [...input.channels].sort();
        if (first.documentType !== input.documentType || first.documentId !== input.documentId ||
          first.clientId !== identity.client.id ||
          existing.length !== input.channels.length ||
          previousChannels.some((channel, index) => channel !== requestedChannels[index])) {
          throw new Error("CONFLICT:Esta chave já foi usada em outra operação.");
        }
        const states = existing.map((row) => row.detail as Record<string, unknown>);
        return existing.map((row, index) => ({
          id: row.id,
          detail: { ...states[index], replay: true },
        }));
      }
      const unresolved = await tx.select({ id: collaboratorAuditTable.id })
        .from(collaboratorAuditTable)
        .where(and(
          eq(collaboratorAuditTable.action, "clinical_document_resend"),
          eq(collaboratorAuditTable.professionalId, identity.professional.id),
          sql`${collaboratorAuditTable.detail} ->> 'empresaId' = ${String(identity.clinic.empresaId)}`,
          sql`${collaboratorAuditTable.detail} ->> 'clinicId' = ${String(identity.clinic.id)}`,
          sql`${collaboratorAuditTable.detail} ->> 'documentType' = ${input.documentType}`,
          sql`${collaboratorAuditTable.detail} ->> 'documentId' = ${String(input.documentId)}`,
          sql`${collaboratorAuditTable.detail} ->> 'clientId' = ${String(identity.client.id)}`,
          sql`${collaboratorAuditTable.detail} ->> 'channel' IN (${sql.join(input.channels.map((channel) => sql`${channel}`), sql`, `)})`,
          sql`${collaboratorAuditTable.detail} ->> 'state' IN ('requested', 'unknown')`,
        )).limit(1);
      if (unresolved.length) {
        throw new Error("CONFLICT:Há um envio anterior sem resultado confirmado. Confira-o antes de tentar novamente.");
      }
      const values = input.channels.map((channel) => ({
        professionalId: identity.professional.id,
        professionalName: identity.professional.name,
        action: "clinical_document_resend",
        method: "POST",
        path: "/clinical-documents/resend",
        detail: {
          clientId: identity.client.id,
          empresaId: identity.clinic.empresaId,
          clinicId: identity.clinic.id,
          professionalId: identity.professional.id,
          documentType: input.documentType,
          documentId: input.documentId,
          pdfSha256,
          channel,
          operationKey: input.operationKey,
          state: "requested",
          shareTokenHash,
          expiresAt,
          recipientMasked: maskedRecipient(channel, destinations[channel]),
          traceId: req.id,
        },
      }));
      return tx.insert(collaboratorAuditTable).values(values)
        .returning({ id: collaboratorAuditTable.id, detail: collaboratorAuditTable.detail });
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("CONFLICT:")) {
      await abandonGate();
      res.status(409).json({ error: error.message.slice("CONFLICT:".length) });
      return;
    }
    throw error;
  }

  if (auditRows.some((row) => (row.detail as Record<string, unknown>).replay === true)) {
    res.status(409).json({
      error: "Esta operação já foi registrada. Confira o histórico antes de tentar novamente.",
      results: auditRows.map(({ id, detail }) => ({
        auditId: id, state: (detail as Record<string, unknown>).state,
      })),
    });
    return;
  }

  const results: Array<{ channel: Channel; auditId: number; state: ResendState; error?: string }> = [];
  for (const row of auditRows) {
    const detail = row.detail as Record<string, unknown>;
    const channel = detail.channel as Channel;
    let state: ResendState = "unknown";
    let error: string | undefined;
    try {
      const delivery = await enviarMensagemPaxter(doc, {
        email: client.email,
        telefone: client.phone,
        telegramChatId: client.telegramChatId,
        nome: identity.client.name,
      }, [channel as PaxterCanal], {
        baseUrl: absoluteBaseUrl(req),
        clienteId: identity.client.id,
        empresaId: identity.clinic.empresaId,
        contexto: "clinical_document_resend",
      });
      const outcome = delivery.resultados[0];
      if (outcome?.sent && !outcome.mock && !outcome.skipped && outcome.via !== "mock") {
        state = "provider_accepted";
      } else if (outcome?.mock) {
        state = "simulated";
        error = "O canal está em modo simulado; nenhuma mensagem foi enviada.";
      } else if (outcome?.skipped) {
        state = "failed";
        error = "O canal não realizou o envio.";
      } else {
        state = "unknown";
        error = outcome?.error || "O provedor não confirmou se recebeu a solicitação.";
      }
    } catch {
      state = "unknown";
      error = "Falha de comunicação; confira o histórico antes de tentar novamente.";
    }
    try {
      await db.update(collaboratorAuditTable).set({
        detail: { ...detail, state, completedAt: new Date().toISOString() },
      }).where(eq(collaboratorAuditTable.id, row.id));
    } catch {
      state = "unknown";
      error = "O envio pode ter ocorrido, mas o registro não foi confirmado. Não repita sem conferir.";
    }
    results.push({ channel, auditId: row.id, state, ...(error ? { error } : {}) });
  }
  if (staffGate.mode === "allowed" && !staffGate.replay) {
    await finishStaffResend(staffGate.requestId, results.map((r) => r.state)).catch(() => undefined);
  }
  res.json({
    documentId: document.id,
    fileName,
    results,
    ...(expiresAt ? { shareExpiresAt: expiresAt } : {}),
  });
});

publicRouter.get("/clinical-documents/share/:token", async (req, res) => {
  noStore(res);
  const token = req.params.token;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    res.status(404).json({ error: "Link indisponível ou expirado." });
    return;
  }
  const tokenHash = hashClinicalShareToken(token);
  const matchingAudits = await db.select().from(collaboratorAuditTable)
    .where(and(
      eq(collaboratorAuditTable.action, "clinical_document_resend"),
      sql`${collaboratorAuditTable.detail} ->> 'shareTokenHash' = ${tokenHash}`,
    ));
  const audit = matchingAudits.find((row) =>
    (row.detail as Record<string, unknown>)?.state === "provider_accepted");
  let detail = audit?.detail as Record<string, unknown> | undefined;
  if (!detail) {
    const telegramShare = await db.execute(sql`SELECT a.document_share_type,a.document_share_id,
        a.document_share_professional_id,a.document_share_pdf_sha256,a.document_share_expires_at,
        a.etapas->'resposta'->>'estado' AS envio_estado,a.estado,m.empresa_id,m.cliente_id
      FROM telegram_atendimento_respostas a
      JOIN telegram_inbox_messages m ON m.id=a.inbox_message_id
      WHERE a.document_share_token_hash=${tokenHash}
        AND a.document_share_type IN (
          'prescricao','pedido_exames','atestado','encaminhamento',
          'protocolo','ras_fap','carta_tratamento','documento_assinado'
        )
        AND a.document_share_expires_at>NOW()
        AND a.etapas->'resposta'->>'estado'='aceito_telegram'
        AND a.estado IN ('processando','concluido')
      LIMIT 1`);
    const row = telegramShare.rows[0] as {
      document_share_type: string; document_share_id: number | string;
      document_share_professional_id: number | string | null; document_share_pdf_sha256: string;
      document_share_expires_at: Date | string; envio_estado: string; estado: string;
      empresa_id: number | string; cliente_id: number | string;
    } | undefined;
    if (row) {
      detail = {
        documentType: row.document_share_type,
        documentId: Number(row.document_share_id),
        clientId: Number(row.cliente_id),
        empresaId: Number(row.empresa_id),
        professionalId: Number(row.document_share_professional_id),
        pdfSha256: row.document_share_pdf_sha256,
        expiresAt: row.document_share_expires_at instanceof Date
          ? row.document_share_expires_at.toISOString()
          : row.document_share_expires_at,
        state: "provider_accepted",
      };
    } else {
      const requestShare = await db.execute(sql`SELECT id,document_type,document_id,client_id,empresa_id,
          location_id,document_pdf_sha256,delivery_share_expires_at
        FROM clinical_document_reissue_requests
        WHERE delivery_share_token_hash=${tokenHash}
          AND delivery_share_expires_at>NOW()
          AND request_status='provider_accepted'
          AND delivery_status IN ('provider_accepted','delivered','read')
        LIMIT 1`);
      const requestRow = requestShare.rows[0] as {
        id: string | number;
        document_type: string; document_id: string;
        client_id: number | string; empresa_id: number | string;
        location_id: number | string;
        document_pdf_sha256: string; delivery_share_expires_at: Date | string;
      } | undefined;
      if (requestRow) {
        detail = {
          requestId: Number(requestRow.id),
          documentType: requestRow.document_type,
          documentId: Number(requestRow.document_id),
          clientId: Number(requestRow.client_id),
          empresaId: Number(requestRow.empresa_id),
          locationId: Number(requestRow.location_id),
          pdfSha256: requestRow.document_pdf_sha256,
          expiresAt: requestRow.delivery_share_expires_at instanceof Date
            ? requestRow.delivery_share_expires_at.toISOString()
            : requestRow.delivery_share_expires_at,
          state: "provider_accepted",
        };
      }
    }
  }
  const expiry = typeof detail?.expiresAt === "string" ? Date.parse(detail.expiresAt) : NaN;
  if (!detail || !Number.isFinite(expiry) || expiry <= Date.now()) {
    res.status(404).json({ error: "Link indisponível ou expirado." });
    return;
  }
  const documentTypeValue = detail.documentType;
  const documentId = Number(detail.documentId);
  const supportedDocumentTypes = new Set<ClinicalDocumentType>([
    "prescricao", "pedido_exames", "atestado", "encaminhamento", "protocolo",
    "ras_fap", "carta_tratamento", "documento_assinado",
  ]);
  if (typeof documentTypeValue !== "string" || !supportedDocumentTypes.has(documentTypeValue as ClinicalDocumentType) ||
    !Number.isSafeInteger(documentId) || documentId <= 0) {
    res.status(404).json({ error: "Link indisponível ou expirado." });
    return;
  }
  const documentType = documentTypeValue as ClinicalDocumentType;
  const document = await getIssuedDocument(documentType, documentId);
  if (!document || document.status !== "emitted" || !document.pdfData ||
    document.clientId !== Number(detail.clientId) ||
    document.empresaId !== Number(detail.empresaId) ||
    (Object.prototype.hasOwnProperty.call(detail, "locationId") &&
      document.locationId !== Number(detail.locationId)) ||
    ((documentType === "prescricao" || documentType === "documento_assinado") &&
      document.signatureStatus !== "signed")) {
    res.status(404).json({ error: "Documento indisponível." });
    return;
  }
  const bytes = Buffer.from(document.pdfData, "base64");
  const pdfSha256 = createHash("sha256").update(bytes).digest("hex");
  const hasExpectedProfessionalId = Object.prototype.hasOwnProperty.call(detail, "professionalId");
  const expectedProfessionalId = detail.professionalId === null || detail.professionalId === undefined
    ? null : Number(detail.professionalId);
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-" ||
    (hasExpectedProfessionalId && document.professionalId !== expectedProfessionalId) ||
    pdfSha256 !== detail.pdfSha256 ||
    document.empresaId !== Number(detail.empresaId)) {
    res.status(404).json({ error: "Documento indisponível." });
    return;
  }
  const reissueRequestId = Number(detail.requestId);
  if (Number.isSafeInteger(reissueRequestId) && reissueRequestId > 0) {
    const access = await db.execute(sql`
      WITH opened AS (
        UPDATE clinical_document_reissue_requests
           SET document_accessed_at=COALESCE(document_accessed_at,NOW()),
               delivery_result='Acesso ao PDF registrado pelo link protegido; não comprova leitura pela titular.',
               updated_at=NOW()
         WHERE id=${reissueRequestId} AND client_id=${Number(detail.clientId)}
           AND empresa_id=${Number(detail.empresaId)} AND location_id=${Number(detail.locationId)}
           AND delivery_share_token_hash=${tokenHash}
           AND delivery_share_expires_at>NOW()
           AND request_status='provider_accepted'
           AND delivery_status IN ('provider_accepted','delivered','read')
         RETURNING id,empresa_id,location_id,document_type,document_id
      )
      INSERT INTO clinical_document_reissue_events
        (request_id,empresa_id,location_id,event_type,details)
      SELECT id,empresa_id,location_id,'document_accessed',
        jsonb_build_object('documentType',document_type,'documentId',document_id)
      FROM opened
      RETURNING request_id
    `);
    if (!access.rows.length) {
      res.status(404).json({ error: "Link indisponível ou expirado." });
      return;
    }
  }
  res.type("application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${safeFilename(document.fileName || `${document.label}.pdf`)}"`);
  res.send(bytes);
});

// Códigos impressos anteriormente continuam reconhecidos, mas exigem login.
publicRouter.get("/recipes/share/:token", async (req, res) => {
  noStore(res);
  const token = req.params.token ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    res.status(404).send("Documento indisponível.");
    return;
  }
  res.redirect(302, `/documento-clinico-receita/${token}`);
});

export { publicRouter as clinicalDocumentShareRouter };
export default router;
