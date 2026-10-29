import { Router } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, clientsTable, collaboratorAuditTable, examRequestPdfsTable } from "@workspace/db";
import { SendExamRequestDocumentsBody } from "@workspace/api-zod";
import { requireCollaborator } from "./collaborator";
import { ClinicalIdentityError, resolveClinicalEmitter } from "../lib/clinical-emitter";
import { enviarMensagemPaxter, type PaxterCanal, type PaxterDoc } from "../lib/messaging/index.js";
import { absoluteBaseUrl } from "../lib/messaging/base-url";
import { renderWhatsappCaption } from "../lib/messaging/render-text";

const router = Router();
const labels: Record<string, string> = { SANGUE: "Sangue / Laboratorial", IMAGEM: "Imagem", OUTROS: "Outros / Procedimentos" };
// Keep every link intact below the smaller Telegram media-caption limit.
function messageBatches(doc: PaxterDoc): PaxterDoc[] {
  const batches: PaxterDoc[] = [];
  let paragraphs = [doc.paragrafos[0]];
  const draft = (parts: string[]): PaxterDoc => ({ ...doc, anexos: undefined, paragrafos: parts });
  const fits = (parts: string[]) => renderWhatsappCaption(draft(parts))
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").length <= 900;
  for (const paragraph of doc.paragrafos.slice(1)) {
    if (!fits([...paragraphs, paragraph])) {
      if (paragraphs.length > 1) batches.push(draft(paragraphs));
      paragraphs = [doc.paragrafos[0]];
      if (!fits([...paragraphs, paragraph])) throw new Error("Link maior que o limite seguro do canal.");
    }
    paragraphs.push(paragraph);
  }
  if (paragraphs.length > 1) batches.push(draft(paragraphs));
  return batches;
}

router.get("/exam-requests/:clientId/history", requireCollaborator, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const identity = await resolveClinicalEmitter(req, Number(req.params.clientId));
    const offset = Number(req.query.offset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) {
      res.status(400).json({ error: "Página inválida." }); return;
    }
    const rows = await db.select({
      id: examRequestPdfsTable.id, tipo: examRequestPdfsTable.tipo,
      fileName: examRequestPdfsTable.fileName, examCount: examRequestPdfsTable.examCount,
      token: examRequestPdfsTable.token, createdAt: examRequestPdfsTable.createdAt,
    }).from(examRequestPdfsTable).where(eq(examRequestPdfsTable.clientId, identity.client.id))
      .orderBy(desc(examRequestPdfsTable.createdAt), desc(examRequestPdfsTable.id)).limit(21).offset(offset);
    const auditRows = await db.select({ id: collaboratorAuditTable.id,
      detail: collaboratorAuditTable.detail, createdAt: collaboratorAuditTable.createdAt,
    }).from(collaboratorAuditTable).where(and(
      eq(collaboratorAuditTable.action, "exam_request_dispatch"),
      sql`${collaboratorAuditTable.detail}->>'clientId' = ${String(identity.client.id)}`,
      sql`${collaboratorAuditTable.detail}->>'empresaId' = ${String(identity.clinic.empresaId)}`,
    )).orderBy(desc(collaboratorAuditTable.createdAt), desc(collaboratorAuditTable.id)).limit(20);
    res.json({
      documents: rows.slice(0, 20).map(row => ({
        id: row.id, tipoLabel: labels[row.tipo] ?? row.tipo, fileName: row.fileName,
        examCount: row.examCount, createdAt: row.createdAt,
        url: `${absoluteBaseUrl(req)}/api/exam-requests/file/${row.token}`,
      })),
      nextOffset: rows.length > 20 ? offset + 20 : null,
      dispatches: auditRows.map(row => {
        const detail = row.detail as { channel?: string; state?: string; documentIds?: number[] };
        return { id: row.id, createdAt: row.createdAt, channel: detail.channel ?? "—",
          state: detail.state ?? "unknown", documentIds: detail.documentIds ?? [] };
      }),
    });
  } catch (error) {
    if (error instanceof ClinicalIdentityError) { res.status(error.status).json({ error: error.message }); return; }
    throw error;
  }
});

router.post("/exam-requests/send", requireCollaborator, async (req, res) => {
  const parsed = SendExamRequestDocumentsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Confirme arquivos e canais antes de enviar." }); return; }
  const body = parsed.data;
  const documentIds = [...new Set(body.documentIds)];
  const channels = [...new Set(body.channels)];
  if (!Number.isSafeInteger(body.clientId) || !documentIds.every(id => Number.isSafeInteger(id) && id > 0)) {
    res.status(400).json({ error: "Identificadores inválidos." }); return;
  }
  try {
    const identity = await resolveClinicalEmitter(req, body.clientId);
    const rows = await db.select().from(examRequestPdfsTable)
      .where(and(eq(examRequestPdfsTable.clientId, identity.client.id), inArray(examRequestPdfsTable.id, documentIds)));
    if (rows.length !== documentIds.length) {
      res.status(422).json({ error: "Um dos documentos não pertence ao cliente ativo ou não está disponível." }); return;
    }
    const [telegram] = await db.select({ telegramChatId: clientsTable.telegramChatId })
      .from(clientsTable).where(eq(clientsTable.id, identity.client.id)).limit(1);
    const destination = { email: identity.client.email, telefone: identity.client.phone,
      telegramChatId: telegram?.telegramChatId, nome: identity.client.name };
    const missing = channels.filter(channel =>
      channel === "EMAIL" ? !destination.email : channel === "WHATSAPP" ? !destination.telefone : !destination.telegramChatId);
    if (missing.length) {
      res.status(422).json({ error: `Cliente sem destino cadastrado nos canais: ${missing.join(", ")}. Nenhum envio foi iniciado.` }); return;
    }
    const baseUrl = absoluteBaseUrl(req);
    const doc: PaxterDoc = {
      titulo: "Solicitação de exames",
      eyebrow: "Documentos do seu atendimento",
      assunto: "Solicitação de exames",
      paragrafos: ["Os pedidos conferidos estão disponíveis nos links abaixo.",
        ...rows.map(row => `${row.fileName.slice(0, 120)}: ${baseUrl}/api/exam-requests/file/${row.token}`)],
      anexos: rows.map(row => ({ filename: row.fileName, content: Buffer.from(row.pdfData, "base64"), contentType: "application/pdf" })),
    };
    const compactBatches = messageBatches(doc);
    // Persist every intended channel before contacting any provider.
    const audits = await db.insert(collaboratorAuditTable).values(channels.map(channel => ({
      professionalId: identity.professional.id, action: "exam_request_dispatch", method: "POST",
      path: "/exam-requests/send",
      detail: { clientId: identity.client.id, empresaId: identity.clinic.empresaId, clinicId: identity.clinic.id,
        documentIds, channel, state: "requested", traceId: req.id },
    }))).returning({ id: collaboratorAuditTable.id, detail: collaboratorAuditTable.detail });
    const reservations = channels.map(channel => {
      const audit = audits.find(a => (a.detail as { channel?: string })?.channel === channel);
      if (!audit) throw new Error("Não foi possível registrar o envio.");
      return { channel, audit };
    });
    const results = [];
    for (const { channel, audit } of reservations) {
      let success = false;
      let error: string | undefined;
      let state = "failed";
      let acceptedMessages = 0;
      const batches = channel === "EMAIL" ? [doc] : compactBatches;
      try {
        for (const batch of batches) {
          const delivery = await enviarMensagemPaxter(batch, destination, [channel as PaxterCanal], {
            baseUrl, clienteId: identity.client.id, empresaId: identity.clinic.empresaId, contexto: "pedido_exames",
          });
          const outcome = delivery.resultados[0];
          success = !!outcome?.sent && !outcome.mock && !outcome.skipped && outcome.via !== "mock";
          state = success ? "provider_accepted" : outcome?.mock ? "simulated" : "failed";
          if (!success) {
            error = outcome?.mock ? "Canal não configurado; envio não realizado." : "O provedor não confirmou o envio.";
            break;
          }
          acceptedMessages++;
        }
      } catch {
        success = false;
        error = "Falha de comunicação com o provedor; confira antes de tentar novamente.";
        state = "unknown";
      }
      if (!success && acceptedMessages) error = `${acceptedMessages} de ${batches.length} mensagens aceitas; não reenvie o lote inteiro sem conferir.`;
      try {
        await db.update(collaboratorAuditTable).set({
          detail: { ...(audit.detail as object), state, acceptedMessages, plannedMessages: batches.length },
        }).where(eq(collaboratorAuditTable.id, audit.id));
      } catch {
        success = false;
        error = "Resultado sem confirmação de auditoria; não repita automaticamente.";
      }
      results.push({ channel, success, auditId: audit.id, ...(error ? { error } : {}) });
    }
    res.json({ results });
  } catch (error) {
    if (error instanceof ClinicalIdentityError) { res.status(error.status).json({ error: error.message }); return; }
    throw error;
  }
});

export default router;
