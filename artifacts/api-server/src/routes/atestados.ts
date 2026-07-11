import { Router, type IRouter } from "express";
import { db, medicalCertificatesTable, insertMedicalCertificateSchema } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { gerarAtestadoPdf } from "../lib/atestado-pdf";
import { ensureClientFolderStructure, uploadFileToDrive } from "../lib/google-drive";
import { aplicarVariaveis, montarValoresDoc } from "../lib/doc-variaveis";

const router: IRouter = Router();

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
  const clientIdRaw = req.query.clientId;
  let rows: (typeof medicalCertificatesTable.$inferSelect)[];
  if (typeof clientIdRaw === "string" && clientIdRaw.trim()) {
    const clientId = Number(clientIdRaw);
    if (Number.isNaN(clientId)) {
      res.status(400).json({ error: "clientId inválido" });
      return;
    }
    rows = await db
      .select()
      .from(medicalCertificatesTable)
      .where(eq(medicalCertificatesTable.clientId, clientId))
      .orderBy(desc(medicalCertificatesTable.id));
  } else {
    rows = await db
      .select()
      .from(medicalCertificatesTable)
      .orderBy(desc(medicalCertificatesTable.id))
      .limit(200);
  }
  res.json(rows.map(serialize));
});

// GET /api/atestados/:id — detalhe.
router.get("/atestados/:id", async (req, res): Promise<void> => {
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
  res.json(serialize(a));
});

// POST /api/atestados — cria (status draft).
router.post("/atestados", async (req, res): Promise<void> => {
  const parsed = insertMedicalCertificateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [a] = await db
    .insert(medicalCertificatesTable)
    .values({ ...parsed.data, status: "draft" })
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
  const parsed = insertMedicalCertificateSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db
    .update(medicalCertificatesTable)
    .set(parsed.data)
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

  // 1) Substitui variáveis {{...}} no servidor (rede de segurança — idempotente
  // se a tela já resolveu). Persiste o corpo final para o PDF e o registro baterem.
  const corpoFinal = aplicarVariaveis(a.corpo, montarValoresDoc(a));
  const pdfBytes = await gerarAtestadoPdf({
    clientName: a.clientName,
    clientCpf: a.clientCpf,
    professionalName: a.professionalName,
    professionalCrm: a.professionalCrm,
    professionalUf: a.professionalUf,
    tipo: a.tipo,
    dias: a.dias,
    dataInicio: a.dataInicio,
    cid: a.cid,
    finalidade: a.finalidade,
    corpo: corpoFinal,
    observacao: a.observacao,
  });
  const pdfBuffer = Buffer.from(pdfBytes);
  const pdfBase64 = pdfBuffer.toString("base64");

  // Nome do arquivo único com id (protege homônimos no Drive — memória `drive-upload-homonimos`).
  const safeClient = a.clientName.replace(/[^a-zA-Z0-9 ]/g, "").trim().toUpperCase();
  const fileName = `ATESTADO ${safeClient} #${a.id}.pdf`.replace(/\s+/g, " ");

  // 2) Persiste o PDF PRIMEIRO (baixável mesmo se o Drive falhar).
  const [emitted] = await db
    .update(medicalCertificatesTable)
    .set({ pdfData: pdfBase64, corpo: corpoFinal, fileName, status: "emitted", emittedAt: new Date() })
    .where(eq(medicalCertificatesTable.id, id))
    .returning();

  // 3) Drive best-effort: NUNCA derruba a emissão.
  let driveFileId: string | null = null;
  let driveWebViewLink: string | null = null;
  try {
    const structure = await ensureClientFolderStructure(a.clientName, a.clientCpf ?? "");
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

  let buf: Buffer;
  if (a.pdfData) {
    buf = Buffer.from(a.pdfData, "base64");
  } else {
    const pdfBytes = await gerarAtestadoPdf({
      clientName: a.clientName,
      clientCpf: a.clientCpf,
      professionalName: a.professionalName,
      professionalCrm: a.professionalCrm,
      professionalUf: a.professionalUf,
      tipo: a.tipo,
      dias: a.dias,
      dataInicio: a.dataInicio,
      cid: a.cid,
      finalidade: a.finalidade,
      corpo: a.corpo,
      observacao: a.observacao,
    });
    buf = Buffer.from(pdfBytes);
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${a.fileName ?? `atestado-${id}.pdf`}"`);
  res.send(buf);
});

export default router;
