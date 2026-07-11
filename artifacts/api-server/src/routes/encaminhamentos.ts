import { Router, type IRouter } from "express";
import { db, referralsTable, insertReferralSchema, clientsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { gerarEncaminhamentoPdf, type UrgenciaEncaminhamento } from "../lib/encaminhamento-pdf";
import { ensureClientFolderStructure, uploadFileToDrive, removeDiacritics } from "../lib/google-drive";
import { aplicarVariaveis, montarValoresDoc } from "../lib/doc-variaveis";

const router: IRouter = Router();

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
  const clientIdRaw = req.query.clientId;
  let rows: (typeof referralsTable.$inferSelect)[];
  if (typeof clientIdRaw === "string" && clientIdRaw.trim()) {
    const clientId = Number(clientIdRaw);
    if (Number.isNaN(clientId)) {
      res.status(400).json({ error: "clientId inválido" });
      return;
    }
    rows = await db
      .select()
      .from(referralsTable)
      .where(eq(referralsTable.clientId, clientId))
      .orderBy(desc(referralsTable.id));
  } else {
    rows = await db.select().from(referralsTable).orderBy(desc(referralsTable.id)).limit(200);
  }
  res.json(rows.map(serialize));
});

// GET /api/encaminhamentos/:id
router.get("/encaminhamentos/:id", async (req, res): Promise<void> => {
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
  res.json(serialize(row));
});

// POST /api/encaminhamentos — cria (status draft).
router.post("/encaminhamentos", async (req, res): Promise<void> => {
  const parsed = insertReferralSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(referralsTable)
    .values({ ...parsed.data, status: "draft" })
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
  const parsed = insertReferralSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db
    .update(referralsTable)
    .set(parsed.data)
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

  // Substitui variáveis {{...}} no servidor (rede de segurança — idempotente se a
  // tela já resolveu). Corpo final vai ao PDF e ao registro para ficarem iguais.
  const corpoFinal = aplicarVariaveis(row.corpo, montarValoresDoc(row));
  const pdfBytes = await gerarEncaminhamentoPdf({
    clientName: row.clientName,
    clientCpf: row.clientCpf,
    clientPhone: row.clientPhone,
    clientEmail: row.clientEmail,
    professionalName: row.professionalName,
    professionalCrm: row.professionalCrm,
    professionalUf: row.professionalUf,
    especialidadeDestino: row.especialidadeDestino,
    profissionalDestino: row.profissionalDestino,
    urgencia: (row.urgencia as UrgenciaEncaminhamento) ?? "eletivo",
    motivo: row.motivo,
    resumoClinico: row.resumoClinico,
    corpo: corpoFinal,
    dateBR: dateBRfull(),
  });
  const pdfBuffer = Buffer.from(pdfBytes);
  const pdfBase64 = pdfBuffer.toString("base64");

  const safeClient = removeDiacritics(row.clientName).replace(/[^a-zA-Z0-9 ]/g, "").trim().toUpperCase();
  const fileName = `ENCAMINHAMENTO ${safeClient} #${row.id}.pdf`.replace(/\s+/g, " ");

  // Persiste PDF + status ANTES do Drive: a emissão nunca depende do upload.
  const [emitido] = await db
    .update(referralsTable)
    .set({ pdfData: pdfBase64, corpo: corpoFinal, fileName, status: "emitted", emittedAt: new Date() })
    .where(eq(referralsTable.id, id))
    .returning();

  // Drive best-effort: nunca derruba a emissão. Nome único com id (não apaga homônimos).
  let driveFileId: string | null = null;
  let driveWebViewLink: string | null = null;
  if (row.clientId != null) {
    try {
      const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, row.clientId));
      const cpf = (client?.cpf ?? row.clientCpf ?? "").trim();
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

  let buf: Buffer;
  if (row.pdfData) {
    buf = Buffer.from(row.pdfData, "base64");
  } else {
    const pdfBytes = await gerarEncaminhamentoPdf({
      clientName: row.clientName,
      clientCpf: row.clientCpf,
      clientPhone: row.clientPhone,
      clientEmail: row.clientEmail,
      professionalName: row.professionalName,
      professionalCrm: row.professionalCrm,
      professionalUf: row.professionalUf,
      especialidadeDestino: row.especialidadeDestino,
      profissionalDestino: row.profissionalDestino,
      urgencia: (row.urgencia as UrgenciaEncaminhamento) ?? "eletivo",
      motivo: row.motivo,
      resumoClinico: row.resumoClinico,
      corpo: row.corpo,
      dateBR: dateBRfull(),
    });
    buf = Buffer.from(pdfBytes);
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${row.fileName ?? `encaminhamento-${id}.pdf`}"`);
  res.send(buf);
});

export default router;
