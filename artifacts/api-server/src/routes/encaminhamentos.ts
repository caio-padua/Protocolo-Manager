import { Router, type IRouter, type Request, type Response } from "express";
import { db, referralsTable, insertReferralSchema, clientsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { gerarEncaminhamentoPdf, type UrgenciaEncaminhamento } from "../lib/encaminhamento-pdf";
import { ensureClientFolderStructure, uploadFileToDrive, removeDiacritics } from "../lib/google-drive";
import { aplicarVariaveis, montarValoresDoc } from "../lib/doc-variaveis";
import { ClinicalIdentityError, resolveClinicalEmitter } from "../lib/clinical-emitter";
import { requireCollaborator } from "./collaborator";

const router: IRouter = Router();
router.use(requireCollaborator);

async function identityForClient(req: Request, res: Response, clientId: number | null | undefined) {
  if (clientId == null) {
    res.status(404).json({ error: "Encaminhamento sem vínculo de cliente verificável." });
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

function dateBRfull(): string {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const day = String(brt.getUTCDate()).padStart(2, "0");
  const month = String(brt.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${brt.getUTCFullYear()}`;
}

function serialize(r: typeof referralsTable.$inferSelect) {
  return {
    id: r.id,
    clientId: r.clientId ?? null,
    clientName: r.clientName,
    clientCpf: r.clientCpf ?? null,
    clientPhone: r.clientPhone ?? null,
    clientEmail: r.clientEmail ?? null,
    professionalId: r.professionalId ?? null,
    professionalName: r.professionalName ?? null,
    professionalCrm: r.professionalCrm ?? null,
    professionalUf: r.professionalUf ?? null,
    especialidadeDestino: r.especialidadeDestino,
    profissionalDestino: r.profissionalDestino ?? null,
    motivo: r.motivo,
    resumoClinico: r.resumoClinico ?? null,
    urgencia: r.urgencia,
    corpo: r.corpo,
    observacao: r.observacao ?? null,
    status: r.status,
    driveFileId: r.driveFileId ?? null,
    driveWebViewLink: r.driveWebViewLink ?? null,
    fileName: r.fileName ?? null,
    createdAt: r.createdAt.toISOString(),
    emittedAt: r.emittedAt ? r.emittedAt.toISOString() : null,
    pdfUrl: `/api/encaminhamentos/${r.id}/pdf`,
  };
}

// GET /api/encaminhamentos?clientId= — lista (ordem desc por id).
router.get("/encaminhamentos", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const clientIdRaw = req.query.clientId;
  const clientId = typeof clientIdRaw === "string" ? Number(clientIdRaw) : NaN;
  if (!Number.isSafeInteger(clientId) || clientId <= 0) {
    res.status(400).json({ error: "Informe um cliente válido para consultar os encaminhamentos." });
    return;
  }
  if (!await identityForClient(req, res, clientId)) return;
  const rows = await db.select().from(referralsTable)
    .where(eq(referralsTable.clientId, clientId))
    .orderBy(desc(referralsTable.id));
  res.json(rows.map(serialize));
});

// GET /api/encaminhamentos/:id
router.get("/encaminhamentos/:id", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const [row] = await db.select().from(referralsTable).where(eq(referralsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Encaminhamento não encontrado" });
    return;
  }
  if (!await identityForClient(req, res, row.clientId)) return;
  res.json(serialize(row));
});

// POST /api/encaminhamentos — cria (status draft).
router.post("/encaminhamentos", async (req, res): Promise<void> => {
  const parsed = insertReferralSchema.safeParse(req.body);
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
  const [row] = await db
    .insert(referralsTable)
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
  res.status(201).json(serialize(row));
});

// PUT /api/encaminhamentos/:id — edita campos.
router.put("/encaminhamentos/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const [existing] = await db.select().from(referralsTable).where(eq(referralsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Encaminhamento não encontrado" });
    return;
  }
  const identity = await identityForClient(req, res, existing.clientId);
  if (!identity) return;
  if (existing.professionalId !== identity.professional.id) {
    res.status(403).json({ error: "Somente o profissional emissor pode editar este rascunho." });
    return;
  }
  if (existing.status !== "draft") {
    res.status(409).json({ error: "Encaminhamentos emitidos não podem ser alterados." });
    return;
  }
  const parsed = insertReferralSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if ((parsed.data.clientId != null && parsed.data.clientId !== existing.clientId) ||
      (parsed.data.professionalId != null && parsed.data.professionalId !== identity.professional.id)) {
    res.status(403).json({ error: "Não é permitido trocar o cliente ou o profissional do documento." });
    return;
  }
  const { especialidadeDestino, profissionalDestino, motivo, resumoClinico, urgencia, corpo, observacao } = parsed.data;
  const [updated] = await db
    .update(referralsTable)
    .set({ especialidadeDestino, profissionalDestino, motivo, resumoClinico, urgencia, corpo, observacao })
    .where(eq(referralsTable.id, id))
    .returning();
  res.json(serialize(updated));
});

// POST /api/encaminhamentos/:id/emitir — gera PDF, marca emitted, sobe ao Drive (best-effort).
router.post("/encaminhamentos/:id/emitir", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const [row] = await db.select().from(referralsTable).where(eq(referralsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Encaminhamento não encontrado" });
    return;
  }
  const identity = await identityForClient(req, res, row.clientId);
  if (!identity) return;
  if (row.professionalId !== identity.professional.id) {
    res.status(403).json({ error: "O documento pertence a outro profissional." });
    return;
  }
  if (row.status === "emitted" && row.pdfData) {
    res.json(serialize(row));
    return;
  }
  if (row.status !== "draft") {
    res.status(409).json({ error: "Somente um rascunho pode ser emitido." });
    return;
  }

  // Substitui variáveis {{...}} no servidor (rede de segurança — idempotente se a
  // tela já resolveu). Corpo final vai ao PDF e ao registro para ficarem iguais.
  const documento = {
    ...row,
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
  const pdfBytes = await gerarEncaminhamentoPdf({
    clientName: documento.clientName,
    clientCpf: documento.clientCpf,
    clientPhone: documento.clientPhone,
    clientEmail: documento.clientEmail,
    professionalName: documento.professionalName,
    professionalCrm: documento.professionalCrm,
    professionalUf: documento.professionalUf,
    especialidadeDestino: documento.especialidadeDestino,
    profissionalDestino: documento.profissionalDestino,
    urgencia: (documento.urgencia as UrgenciaEncaminhamento) ?? "eletivo",
    motivo: documento.motivo,
    resumoClinico: documento.resumoClinico,
    corpo: corpoFinal,
    dateBR: dateBRfull(),
  });
  const pdfBuffer = Buffer.from(pdfBytes);
  const pdfBase64 = pdfBuffer.toString("base64");

  const safeClient = removeDiacritics(documento.clientName).replace(/[^a-zA-Z0-9 ]/g, "").trim().toUpperCase();
  const fileName = `ENCAMINHAMENTO ${safeClient} #${row.id}.pdf`.replace(/\s+/g, " ");

  // Persiste PDF + status ANTES do Drive: a emissão nunca depende do upload.
  const [emitido] = await db
    .update(referralsTable)
    .set({
      clientName: documento.clientName, clientCpf: documento.clientCpf,
      clientPhone: documento.clientPhone, clientEmail: documento.clientEmail,
      professionalId: documento.professionalId, professionalName: documento.professionalName,
      professionalCrm: documento.professionalCrm, professionalUf: documento.professionalUf,
      pdfData: pdfBase64, corpo: corpoFinal, fileName, status: "emitted", emittedAt: new Date(),
    })
    .where(eq(referralsTable.id, id))
    .returning();

  // Drive best-effort: nunca derruba a emissão. Nome único com id (não apaga homônimos).
  let driveFileId: string | null = null;
  let driveWebViewLink: string | null = null;
  if (documento.clientId != null) {
    try {
      const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, documento.clientId!));
      const cpf = (client?.cpf ?? documento.clientCpf ?? "").trim();
      if (client && cpf) {
        const structure = await ensureClientFolderStructure(client.name, cpf);
        const folderId = structure.subfolders["ATESTADOS"] ?? structure.clientFolderId;
        const up = await uploadFileToDrive(folderId, fileName, "application/pdf", pdfBuffer, true);
        driveFileId = up.fileId;
        driveWebViewLink = up.webViewLink;
        await db
          .update(referralsTable)
          .set({ driveFileId, driveWebViewLink })
          .where(eq(referralsTable.id, id));
      }
    } catch (err) {
      req.log.warn({ err, referralId: id }, "Falha ao subir encaminhamento ao Drive");
    }
  }

  res.json({ ...serialize(emitido), driveFileId, driveWebViewLink, pdfData: pdfBase64 });
});

// GET /api/encaminhamentos/:id/pdf — devolve o PDF (base64 ou regenera).
router.get("/encaminhamentos/:id/pdf", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "id inválido" });
    return;
  }
  const [row] = await db.select().from(referralsTable).where(eq(referralsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Encaminhamento não encontrado" });
    return;
  }
  if (!await identityForClient(req, res, row.clientId)) return;
  if (row.status !== "emitted" || !row.pdfData) {
    res.status(404).json({ error: "Encaminhamento emitido ou PDF não encontrado." });
    return;
  }
  const buf = Buffer.from(row.pdfData, "base64");

  res.setHeader("Content-Type", "application/pdf");
  const mode = req.query.download === "1" ? "attachment" : "inline";
  res.setHeader("Content-Disposition", `${mode}; filename="${row.fileName ?? `encaminhamento-${id}.pdf`}"`);
  res.send(buf);
});

export default router;
