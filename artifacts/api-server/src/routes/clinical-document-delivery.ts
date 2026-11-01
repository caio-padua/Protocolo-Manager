import { createHash, randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db, clientsTable, collaboratorAuditTable, medicalCertificatesTable, referralsTable,
  recipesTable, prescriptionsTable, examRequestPdfsTable,
} from "@workspace/db";
import { z } from "zod";
import { requireCollaborator } from "./collaborator";
import { ClinicalIdentityError, resolveClinicalEmitter } from "../lib/clinical-emitter";
import { absoluteBaseUrl } from "../lib/messaging/base-url";
import { enviarMensagemPaxter, type PaxterCanal, type PaxterDoc } from "../lib/messaging/index.js";
import { authorizedPrescription } from "./prescription-delivery";

const router = Router();
const publicRouter = Router();
const shareLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const ResendBody = z.object({
  documentType: z.enum(["prescricao", "pedido_exames", "atestado", "encaminhamento"]),
  documentId: z.number().int().positive(),
  clientId: z.number().int().positive(),
  channels: z.array(z.enum(["EMAIL", "WHATSAPP", "TELEGRAM"])).min(1).max(3),
  confirmed: z.literal(true),
  operationKey: z.string().uuid(),
}).strict().refine((value) => new Set(value.channels).size === value.channels.length, {
  message: "Selecione cada canal apenas uma vez.",
});

type DocumentType = "prescricao" | "pedido_exames" | "atestado" | "encaminhamento";
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

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function safeFilename(value: string) {
  return (value || "documento-clinico.pdf").replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 120);
}

async function getIssuedDocument(type: DocumentType, documentId: number) {
  if (type === "prescricao") {
    const [recipe] = await db.select().from(recipesTable)
      .where(eq(recipesTable.id, documentId)).limit(1);
    if (!recipe) return null;
    const [prescription] = await db.select().from(prescriptionsTable)
      .where(eq(prescriptionsTable.id, recipe.prescriptionId)).limit(1);
    if (!prescription) return null;
    return {
      id: recipe.id, clientId: prescription.clientId, professionalId: prescription.professionalId,
      prescriptionId: recipe.prescriptionId, status: prescription.status, pdfData: recipe.pdfData,
      fileName: recipe.fileName, label: recipe.title || "Receita",
    };
  }
  if (type === "pedido_exames") {
    const [row] = await db.select().from(examRequestPdfsTable)
      .where(eq(examRequestPdfsTable.id, documentId)).limit(1);
    if (!row) return null;
    return {
      id: row.id, clientId: row.clientId, professionalId: row.professionalId,
      status: "emitted", pdfData: row.pdfData, fileName: row.fileName,
      label: `Pedido de exames — ${row.fileName}`,
    };
  }
  if (type === "atestado") {
    const [row] = await db.select().from(medicalCertificatesTable)
      .where(eq(medicalCertificatesTable.id, documentId)).limit(1);
    if (!row) return null;
    return {
      id: row.id, clientId: row.clientId, professionalId: row.professionalId, status: row.status,
      pdfData: row.pdfData, fileName: row.fileName,
      label: `Atestado${row.tipo ? ` — ${row.tipo}` : ""}`,
    };
  }
  const [row] = await db.select().from(referralsTable)
    .where(eq(referralsTable.id, documentId)).limit(1);
  if (!row) return null;
  return {
    id: row.id, clientId: row.clientId, professionalId: row.professionalId, status: row.status,
    pdfData: row.pdfData, fileName: row.fileName,
    label: `Encaminhamento${row.especialidadeDestino ? ` — ${row.especialidadeDestino}` : ""}`,
  };
}

function maskedRecipient(channel: Channel, value: string) {
  if (channel === "EMAIL") {
    const [name, domain] = value.split("@");
    return `${(name || "").slice(0, 1)}***@${domain || "***"}`;
  }
  return `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

router.use(requireCollaborator);

router.get("/clinical-documents/:documentType/:documentId/pdf", async (req, res) => {
  noStore(res);
  const type = req.params.documentType;
  const documentId = Number(req.params.documentId);
  if (!["prescricao", "pedido_exames", "atestado", "encaminhamento"].includes(type) ||
    !Number.isSafeInteger(documentId) || documentId <= 0) {
    res.status(404).json({ error: "Documento indisponível." });
    return;
  }
  const document = await getIssuedDocument(type as DocumentType, documentId);
  if (!document || !document.clientId || document.status !== "emitted" ||
    document.professionalId === null || document.professionalId === undefined || !document.pdfData) {
    res.status(404).json({ error: "Documento indisponível." });
    return;
  }
  let identity;
  try {
    identity = await resolveClinicalEmitter(req, document.clientId);
  } catch (error) {
    if (error instanceof ClinicalIdentityError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
  if (identity.professional.id !== document.professionalId) {
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
  res.json({ targets });
});

router.get("/clinical-documents/delivery-history/:documentType/:documentId", async (req, res) => {
  noStore(res);
  const type = req.params.documentType;
  const documentId = Number(req.params.documentId);
  if (!["prescricao", "pedido_exames", "atestado", "encaminhamento"].includes(type) ||
    !Number.isSafeInteger(documentId) || documentId <= 0) {
    res.status(404).json({ error: "Histórico indisponível." });
    return;
  }
  const document = await getIssuedDocument(type as DocumentType, documentId);
  if (!document || !document.clientId || document.status !== "emitted" || !document.professionalId) {
    res.status(404).json({ error: "Histórico indisponível." });
    return;
  }
  let identity;
  try {
    identity = await resolveClinicalEmitter(req, document.clientId);
  } catch (error) {
    if (error instanceof ClinicalIdentityError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
  if (identity.professional.id !== document.professionalId) {
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
    identity = await resolveClinicalEmitter(req, input.clientId);
  } catch (error) {
    if (error instanceof ClinicalIdentityError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
  const document = await getIssuedDocument(input.documentType, input.documentId);
  if (!document || document.clientId !== identity.client.id || document.professionalId !== identity.professional.id ||
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
  if (missing.length) {
    res.status(422).json({ error: `Não há destino cadastrado para: ${missing.join(", ")}. Nenhum envio foi iniciado.` });
    return;
  }

  const shareToken = input.channels.some((channel) => channel === "WHATSAPP" || channel === "TELEGRAM")
    ? randomBytes(32).toString("base64url")
    : null;
  const shareTokenHash = shareToken ? hashToken(shareToken) : null;
  const expiresAt = shareToken ? new Date(Date.now() + shareLifetimeMs).toISOString() : null;
  const publicUrl = shareToken ? `${absoluteBaseUrl(req)}/api/clinical-documents/share/${shareToken}` : null;
  const fileName = safeFilename(document.fileName || `${document.label}.pdf`);
  const pdfBuffer = Buffer.from(document.pdfData, "base64");
  if (pdfBuffer.length === 0) {
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
  const tokenHash = hashToken(token);
  const matchingAudits = await db.select().from(collaboratorAuditTable)
    .where(and(
      eq(collaboratorAuditTable.action, "clinical_document_resend"),
      sql`${collaboratorAuditTable.detail} ->> 'shareTokenHash' = ${tokenHash}`,
    ));
  const audit = matchingAudits.find((row) =>
    (row.detail as Record<string, unknown>)?.state === "provider_accepted");
  const detail = audit?.detail as Record<string, unknown> | undefined;
  const expiry = typeof detail?.expiresAt === "string" ? Date.parse(detail.expiresAt) : NaN;
  if (!detail || !Number.isFinite(expiry) || expiry <= Date.now()) {
    res.status(404).json({ error: "Link indisponível ou expirado." });
    return;
  }
  const documentType = detail.documentType;
  const documentId = Number(detail.documentId);
  if ((documentType !== "prescricao" && documentType !== "pedido_exames" &&
      documentType !== "atestado" && documentType !== "encaminhamento") ||
    !Number.isSafeInteger(documentId) || documentId <= 0) {
    res.status(404).json({ error: "Link indisponível ou expirado." });
    return;
  }
  const document = await getIssuedDocument(documentType, documentId);
  if (!document || document.status !== "emitted" || !document.pdfData ||
    document.clientId !== Number(detail.clientId)) {
    res.status(404).json({ error: "Documento indisponível." });
    return;
  }
  const bytes = Buffer.from(document.pdfData, "base64");
  const pdfSha256 = createHash("sha256").update(bytes).digest("hex");
  if (!bytes.length || document.professionalId !== Number(detail.professionalId) ||
    pdfSha256 !== detail.pdfSha256) {
    res.status(404).json({ error: "Documento indisponível." });
    return;
  }
  res.type("application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${safeFilename(document.fileName || `${document.label}.pdf`)}"`);
  res.send(bytes);
});

export { publicRouter as clinicalDocumentShareRouter };
export default router;
