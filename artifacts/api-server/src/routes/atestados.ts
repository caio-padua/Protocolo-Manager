import { Router, type IRouter, type Request, type Response } from "express";
import { db, medicalCertificatesTable, insertMedicalCertificateSchema } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { gerarAtestadoPdf } from "../lib/atestado-pdf";
import { ensureClientFolderStructure, uploadFileToDrive } from "../lib/google-drive";
import { aplicarVariaveis, montarValoresDoc } from "../lib/doc-variaveis";
import { ClinicalIdentityError, resolveClinicalEmitter } from "../lib/clinical-emitter";
import { requireCollaborator } from "./collaborator";

const router: IRouter = Router();
router.use(requireCollaborator);

async function identityForClient(req: Request, res: Response, clientId: number | null | undefined) {
  if (clientId == null) {
    res.status(404).json({ error: "Atestado sem vínculo de cliente verificável." });
    return null;
  }
  try {
    return await resolveClinicalEmitter(req, clientId);
  } catch (error) {
    if (error instanceof ClinicalIdentityError) {
      res.status(error.status).json({ error: error.message });
      return null;
    }
    throw error;
  }
}

function serialize(a: typeof medicalCertificatesTable.$inferSelect) {
  return {
    id: a.id,
    clientId: a.clientId ?? null,
    clientName: a.clientName,
    clientCpf: a.clientCpf ?? null,
    clientPhone: a.clientPhone ?? null,
    clientEmail: a.clientEmail ?? null,
    professionalId: a.professionalId ?? null,
    professionalName: a.professionalName ?? null,
    professionalCrm: a.professionalCrm ?? null,
    professionalUf: a.professionalUf ?? null,
    tipo: a.tipo,
    dias: a.dias ?? null,
    dataInicio: a.dataInicio ?? null,
    cid: a.cid ?? null,
    finalidade: a.finalidade ?? null,
    corpo: a.corpo,
    observacao: a.observacao ?? null,
    status: a.status,
    driveFileId: a.driveFileId ?? null,
    driveWebViewLink: a.driveWebViewLink ?? null,
    fileName: a.fileName ?? null,
    pdfUrl: `/api/atestados/${a.id}/pdf`,
    createdAt: a.createdAt.toISOString(),
    emittedAt: a.emittedAt ? a.emittedAt.toISOString() : null,
  };
}

// GET /api/atestados?clientId= — lista (ordem desc por id).
router.get("/atestados", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const clientIdRaw = req.query.clientId;
  const clientId = typeof clientIdRaw === "string" ? Number(clientIdRaw) : NaN;
  if (!Number.isSafeInteger(clientId) || clientId <= 0) {
    res.status(400).json({ error: "Informe um cliente válido para consultar os atestados." });
    return;
  }
  if (!await identityForClient(req, res, clientId)) return;
  const rows = await db.select().from(medicalCertificatesTable)
    .where(eq(medicalCertificatesTable.clientId, clientId))
    .orderBy(desc(medicalCertificatesTable.id));
  res.json(rows.map(serialize));
});

// GET /api/atestados/:id — detalhe.
router.get("/atestados/:id", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const [a] = await db.select().from(medicalCertificatesTable).where(eq(medicalCertificatesTable.id, id));
  if (!a) {
    res.status(404).json({ error: "Atestado não encontrado" });
    return;
  }
  if (!await identityForClient(req, res, a.clientId)) return;
  res.json(serialize(a));
});

// POST /api/atestados — cria (status draft).
router.post("/atestados", async (req, res): Promise<void> => {
  const parsed = insertMedicalCertificateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const identity = await identityForClient(req, res, parsed.data.clientId);
  if (!identity) return;
  if (parsed.data.professionalId != null && parsed.data.professionalId !== identity.professional.id) {
    res.status(403).json({ error: "O profissional do documento deve ser o colaborador autenticado." });
    return;
  }
  const [a] = await db
    .insert(medicalCertificatesTable)
    .values({
      ...parsed.data,
      clientName: identity.client.name,
      clientCpf: identity.client.cpf,
      clientPhone: identity.client.phone,
      clientEmail: identity.client.email,
      professionalId: identity.professional.id,
      professionalName: identity.professional.name,
      professionalCrm: identity.professional.crm,
      professionalUf: identity.professional.uf,
      status: "draft",
    })
    .returning();
  res.status(201).json(serialize(a));
});

// PUT /api/atestados/:id — edita campos.
router.put("/atestados/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const [existing] = await db.select().from(medicalCertificatesTable).where(eq(medicalCertificatesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Atestado não encontrado" });
    return;
  }
  const identity = await identityForClient(req, res, existing.clientId);
  if (!identity) return;
  if (existing.professionalId !== identity.professional.id) {
    res.status(403).json({ error: "Somente o profissional emissor pode editar este rascunho." });
    return;
  }
  if (existing.status !== "draft") {
    res.status(409).json({ error: "Atestados emitidos não podem ser alterados." });
    return;
  }
  const parsed = insertMedicalCertificateSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if ((parsed.data.clientId != null && parsed.data.clientId !== existing.clientId) ||
      (parsed.data.professionalId != null && parsed.data.professionalId !== identity.professional.id)) {
    res.status(403).json({ error: "Não é permitido trocar o cliente ou o profissional do documento." });
    return;
  }
  const { tipo, dias, dataInicio, cid, finalidade, corpo, observacao } = parsed.data;
  const [updated] = await db
    .update(medicalCertificatesTable)
    .set({ tipo, dias, dataInicio, cid, finalidade, corpo, observacao })
    .where(eq(medicalCertificatesTable.id, id))
    .returning();
  res.json(serialize(updated));
});

// POST /api/atestados/:id/emitir — gera PDF, grava base64, sobe ao Drive (best-effort).
router.post("/atestados/:id/emitir", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const [a] = await db.select().from(medicalCertificatesTable).where(eq(medicalCertificatesTable.id, id));
  if (!a) {
    res.status(404).json({ error: "Atestado não encontrado" });
    return;
  }
  const identity = await identityForClient(req, res, a.clientId);
  if (!identity) return;
  if (a.professionalId !== identity.professional.id) {
    res.status(403).json({ error: "O documento pertence a outro profissional." });
    return;
  }
  if (a.status === "emitted" && a.pdfData) {
    res.json(serialize(a));
    return;
  }
  if (a.status !== "draft") {
    res.status(409).json({ error: "Somente um rascunho pode ser emitido." });
    return;
  }

  // 1) Substitui variáveis {{...}} no servidor (rede de segurança — idempotente
  // se a tela já resolveu). Persiste o corpo final para o PDF e o registro baterem.
  const documento = {
    ...a,
    clientName: identity.client.name,
    clientCpf: identity.client.cpf,
    clientPhone: identity.client.phone,
    clientEmail: identity.client.email,
    professionalId: identity.professional.id,
    professionalName: identity.professional.name,
    professionalCrm: identity.professional.crm,
    professionalUf: identity.professional.uf,
  };
  const corpoFinal = aplicarVariaveis(documento.corpo, montarValoresDoc(documento));
  const pdfBytes = await gerarAtestadoPdf({
    clientName: documento.clientName,
    clientCpf: documento.clientCpf,
    professionalName: documento.professionalName,
    professionalCrm: documento.professionalCrm,
    professionalUf: documento.professionalUf,
    tipo: documento.tipo,
    dias: documento.dias,
    dataInicio: documento.dataInicio,
    cid: documento.cid,
    finalidade: documento.finalidade,
    corpo: corpoFinal,
    observacao: documento.observacao,
  });
  const pdfBuffer = Buffer.from(pdfBytes);
  const pdfBase64 = pdfBuffer.toString("base64");

  // Nome do arquivo único com id (protege homônimos no Drive — memória `drive-upload-homonimos`).
  const safeClient = documento.clientName.replace(/[^a-zA-Z0-9 ]/g, "").trim().toUpperCase();
  const fileName = `ATESTADO ${safeClient} #${a.id}.pdf`.replace(/\s+/g, " ");

  // 2) Persiste o PDF PRIMEIRO (baixável mesmo se o Drive falhar).
  const [emitted] = await db
    .update(medicalCertificatesTable)
    .set({
      clientName: documento.clientName, clientCpf: documento.clientCpf,
      clientPhone: documento.clientPhone, clientEmail: documento.clientEmail,
      professionalId: documento.professionalId, professionalName: documento.professionalName,
      professionalCrm: documento.professionalCrm, professionalUf: documento.professionalUf,
      pdfData: pdfBase64, corpo: corpoFinal, fileName, status: "emitted", emittedAt: new Date(),
    })
    .where(eq(medicalCertificatesTable.id, id))
    .returning();

  // 3) Drive best-effort: NUNCA derruba a emissão.
  let driveFileId: string | null = null;
  let driveWebViewLink: string | null = null;
  try {
    const structure = await ensureClientFolderStructure(documento.clientName, documento.clientCpf ?? "");
    const folderId = structure.subfolders["ATESTADOS"] ?? structure.clientFolderId;
    const up = await uploadFileToDrive(folderId, fileName, "application/pdf", pdfBuffer, true);
    driveFileId = up.fileId;
    driveWebViewLink = up.webViewLink;
    await db
      .update(medicalCertificatesTable)
      .set({ driveFileId, driveWebViewLink })
      .where(eq(medicalCertificatesTable.id, id));
  } catch (err) {
    req.log.warn({ err, atestadoId: id }, "Falha ao subir atestado ao Drive");
  }

  res.json({ ...serialize({ ...emitted, driveFileId, driveWebViewLink }), pdfData: pdfBase64 });
});

// GET /api/atestados/:id/pdf — devolve o PDF (base64 gravado ou regenera).
router.get("/atestados/:id/pdf", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const [a] = await db.select().from(medicalCertificatesTable).where(eq(medicalCertificatesTable.id, id));
  if (!a) {
    res.status(404).json({ error: "Atestado não encontrado" });
    return;
  }
  if (!await identityForClient(req, res, a.clientId)) return;
  if (a.status !== "emitted" || !a.pdfData) {
    res.status(404).json({ error: "Atestado emitido ou PDF não encontrado." });
    return;
  }
  const buf = Buffer.from(a.pdfData, "base64");
  res.setHeader("Content-Type", "application/pdf");
  const mode = req.query.download === "1" ? "attachment" : "inline";
  res.setHeader("Content-Disposition", `${mode}; filename="${a.fileName ?? `atestado-${id}.pdf`}"`);
  res.send(buf);
});

export default router;
