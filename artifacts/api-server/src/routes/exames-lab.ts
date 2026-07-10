import { Router, type IRouter, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import multer from "multer";
import {
  db,
  examDocumentsTable,
  examResultsTable,
  clientsTable,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { extractPdfText } from "../lib/exam-extraction/pdf-text";
import { extractExamFromText } from "../lib/exam-extraction/extract";
import {
  persistExtractedResults,
  finalizeDocument,
  markDocumentError,
} from "../lib/exam-extraction/persist";
import {
  ensureClientFolderStructure,
  uploadFileToDrive,
  removeDiacritics,
} from "../lib/google-drive";
import { sendWhatsapp } from "../lib/whatsapp";
import { sendGmailMessage } from "../lib/google-gmail";

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ============================================================================
// Trajetoria do Exame Uploadado — rotas (Ondas 3 a 6 da spec
// specs/trajetoria-exame-upload.md). Pipeline ASSINCRONO: o POST /ingest
// responde 202 na hora e o processamento (IA, 70-106s em laudo grande) roda
// em background dentro do proprio processo do servidor.
// ============================================================================

export interface IngestJobInput {
  documentId: number;
  clientId: number;
  buffer: Buffer;
  fileName: string;
  /** id do PDF ja arquivado no Drive (portal); se ausente, arquivamos aqui */
  sourcePdfDriveId?: string | null;
  /** true = enviar aviso "exame recebido" (e-mail + WhatsApp) ao concluir */
  notify?: boolean;
}

/** Processa 1 documento: texto -> IA -> banco -> Drive -> aviso. */
export async function processExamDocument(job: IngestJobInput): Promise<void> {
  const { documentId, clientId, buffer, fileName } = job;
  try {
    const pdfText = await extractPdfText(buffer);
    const { data, modelUsed } = await extractExamFromText(pdfText.text);

    await finalizeDocument(documentId, data, modelUsed);
    const summary = await persistExtractedResults({
      documentId,
      clientId,
      extracted: data,
    });
    console.log(
      `[ExamesLab] doc ${documentId}: ${summary.resultsInserted} resultados + ${summary.historyInserted} historicos (casados: ${summary.matched}, sem catalogo: ${summary.unmatched})`,
    );

    // Arquivo no Drive (EXAMES) — best-effort, idempotente por nome unico
    if (!job.sourcePdfDriveId) {
      try {
        const clients = await db
          .select()
          .from(clientsTable)
          .where(eq(clientsTable.id, clientId));
        const client = clients[0];
        if (client && client.cpf) {
          const structure = await ensureClientFolderStructure(client.name, client.cpf);
          const examesFolderId = structure.subfolders["EXAMES"];
          if (examesFolderId) {
            const now = new Date();
            const dateStr = `${String(now.getFullYear()).slice(2)}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
            const clean = removeDiacritics(client.name).toUpperCase();
            const driveName = `${dateStr} EXAME ${clean} (DOC ${documentId}).pdf`;
            const uploaded = await uploadFileToDrive(
              examesFolderId,
              driveName,
              "application/pdf",
              buffer,
            );
            await db
              .update(examDocumentsTable)
              .set({ sourcePdfDriveId: uploaded.fileId })
              .where(eq(examDocumentsTable.id, documentId));
          }
        }
      } catch (err) {
        console.error(
          `[ExamesLab] doc ${documentId}: falha ao arquivar no Drive: ${(err as Error).message}`,
        );
      }
    } else {
      await db
        .update(examDocumentsTable)
        .set({ sourcePdfDriveId: job.sourcePdfDriveId })
        .where(eq(examDocumentsTable.id, documentId));
    }

    // Aviso "exame recebido" — best-effort
    if (job.notify) {
      try {
        const clients = await db
          .select()
          .from(clientsTable)
          .where(eq(clientsTable.id, clientId));
        const client = clients[0];
        if (client) {
          const firstName = client.name.split(" ")[0];
          if (client.email) {
            await sendGmailMessage({
              to: client.email,
              subject: "Clinica Padua | Exame recebido",
              html: `<p>Ola, ${firstName}!</p><p>Recebemos o seu exame (<strong>${fileName}</strong>) e ele ja foi lido e arquivado no seu prontuario.</p><p>Qualquer ponto de atencao sera avaliado pela equipe.</p><p>Equipe PAXTER</p>`,
            });
          }
          if (client.phone) {
            await sendWhatsapp(
              client.phone,
              `Ola, ${firstName}! Recebemos o seu exame (${fileName}) e ele ja foi lido e arquivado no seu prontuario. Qualquer ponto de atencao sera avaliado pela equipe.`,
              { contexto: "exame_recebido", clienteId: clientId },
            );
          }
        }
      } catch (err) {
        console.error(
          `[ExamesLab] doc ${documentId}: falha no aviso: ${(err as Error).message}`,
        );
      }
    }
  } catch (err) {
    const message = (err as Error).message ?? "erro desconhecido";
    console.error(`[ExamesLab] doc ${documentId}: ERRO no processamento: ${message}`);
    await markDocumentError(documentId, message).catch(() => undefined);
  }
}

/**
 * Cria o documento (status=processando) e dispara o processamento em
 * background. Idempotente por hash: mesmo arquivo nao duplica.
 */
export async function startExamIngestion(params: {
  clientId: number;
  buffer: Buffer;
  fileName: string;
  sourcePdfDriveId?: string | null;
  notify?: boolean;
}): Promise<{ documentId: number; duplicate: boolean }> {
  const hash = createHash("sha256").update(params.buffer).digest("hex");

  // Idempotencia POR PACIENTE: mesmo arquivo em outro cliente gera doc proprio.
  const existing = await db
    .select({ id: examDocumentsTable.id })
    .from(examDocumentsTable)
    .where(
      and(
        eq(examDocumentsTable.clientId, params.clientId),
        eq(examDocumentsTable.hash, hash),
      ),
    );
  if (existing.length > 0) {
    return { documentId: existing[0].id, duplicate: true };
  }

  const [doc] = await db
    .insert(examDocumentsTable)
    .values({
      clientId: params.clientId,
      hash,
      fileName: params.fileName,
      status: "processando",
    })
    .returning({ id: examDocumentsTable.id });

  setImmediate(() => {
    void processExamDocument({
      documentId: doc.id,
      clientId: params.clientId,
      buffer: params.buffer,
      fileName: params.fileName,
      sourcePdfDriveId: params.sourcePdfDriveId ?? null,
      notify: params.notify ?? false,
    });
  });

  return { documentId: doc.id, duplicate: false };
}

// ---- POST /exames-lab/ingest — Modo Duplo (upload avulso por seletor) ----
router.post(
  "/exames-lab/ingest",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const clientId = Number(req.body.clientId);
      const file = req.file;
      if (!Number.isInteger(clientId) || clientId <= 0 || !file) {
        res.status(400).json({ error: "clientId e arquivo sao obrigatorios" });
        return;
      }
      if (file.mimetype !== "application/pdf") {
        res.status(400).json({ error: "Por enquanto apenas PDF e aceito nesta trilha" });
        return;
      }
      const clients = await db
        .select({ id: clientsTable.id })
        .from(clientsTable)
        .where(eq(clientsTable.id, clientId));
      if (clients.length === 0) {
        res.status(404).json({ error: "Cliente nao encontrado" });
        return;
      }

      const notify = req.body.notify === "true" || req.body.notify === true;
      const result = await startExamIngestion({
        clientId,
        buffer: file.buffer,
        fileName: file.originalname,
        notify,
      });

      res.status(result.duplicate ? 200 : 202).json(result);
    } catch (err) {
      console.error("[ExamesLab] Erro no ingest:", (err as Error).message);
      res.status(500).json({ error: "Erro ao receber exame" });
    }
  },
);

// ---- GET /exames-lab/documentos?clientId= ----
router.get("/exames-lab/documentos", async (req: Request, res: Response) => {
  try {
    const clientId = req.query.clientId ? Number(req.query.clientId) : null;
    const base = db
      .select({
        id: examDocumentsTable.id,
        clientId: examDocumentsTable.clientId,
        fileName: examDocumentsTable.fileName,
        labName: examDocumentsTable.labName,
        collectionDate: examDocumentsTable.collectionDate,
        status: examDocumentsTable.status,
        confidence: examDocumentsTable.confidence,
        modelUsed: examDocumentsTable.modelUsed,
        createdAt: examDocumentsTable.createdAt,
        conferredAt: examDocumentsTable.conferredAt,
      })
      .from(examDocumentsTable);
    const docs = clientId
      ? await base.where(eq(examDocumentsTable.clientId, clientId)).orderBy(desc(examDocumentsTable.id))
      : await base.orderBy(desc(examDocumentsTable.id));

    // nome do cliente para exibicao
    const clientIds = [...new Set(docs.map((d) => d.clientId))];
    const names = new Map<number, string>();
    for (const cid of clientIds) {
      const rows = await db
        .select({ id: clientsTable.id, name: clientsTable.name })
        .from(clientsTable)
        .where(eq(clientsTable.id, cid));
      if (rows[0]) names.set(cid, rows[0].name);
    }
    res.json(
      docs.map((d) => ({ ...d, clientName: names.get(d.clientId) ?? `Cliente ${d.clientId}` })),
    );
  } catch (err) {
    console.error("[ExamesLab] Erro ao listar documentos:", (err as Error).message);
    res.status(500).json({ error: "Erro ao listar documentos" });
  }
});

// ---- GET /exames-lab/documentos/:id — detalhe + resultados ----
router.get("/exames-lab/documentos/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const docs = await db
      .select()
      .from(examDocumentsTable)
      .where(eq(examDocumentsTable.id, id));
    if (docs.length === 0) {
      res.status(404).json({ error: "Documento nao encontrado" });
      return;
    }
    const results = await db
      .select()
      .from(examResultsTable)
      .where(eq(examResultsTable.examDocumentId, id))
      .orderBy(examResultsTable.id);
    const { rawJson: _raw, hash: _hash, ...docPublic } = docs[0];
    res.json({ ...docPublic, results });
  } catch (err) {
    console.error("[ExamesLab] Erro no detalhe:", (err as Error).message);
    res.status(500).json({ error: "Erro ao buscar documento" });
  }
});

// ---- PATCH /exames-lab/documentos/:id/conferir — 1 clique ----
router.patch(
  "/exames-lab/documentos/:id/conferir",
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const docs = await db
        .select({ id: examDocumentsTable.id, status: examDocumentsTable.status })
        .from(examDocumentsTable)
        .where(eq(examDocumentsTable.id, id));
      if (docs.length === 0) {
        res.status(404).json({ error: "Documento nao encontrado" });
        return;
      }
      if (docs[0].status === "processando") {
        res.status(409).json({ error: "Documento ainda em processamento" });
        return;
      }
      await db
        .update(examDocumentsTable)
        .set({ status: "conferido", conferredAt: new Date() })
        .where(eq(examDocumentsTable.id, id));
      res.json({ ok: true });
    } catch (err) {
      console.error("[ExamesLab] Erro ao conferir:", (err as Error).message);
      res.status(500).json({ error: "Erro ao conferir documento" });
    }
  },
);

// ---- GET /exames-lab/evolucao/:clientId — antes/depois por analito ----
router.get("/exames-lab/evolucao/:clientId", async (req: Request, res: Response) => {
  try {
    const clientId = Number(req.params.clientId);
    // Regra da spec: valor so vira verdade clinica APOS conferencia humana.
    // A evolucao le somente resultados de documentos CONFERIDOS.
    const joined = await db
      .select({ result: examResultsTable })
      .from(examResultsTable)
      .innerJoin(
        examDocumentsTable,
        eq(examResultsTable.examDocumentId, examDocumentsTable.id),
      )
      .where(
        and(
          eq(examResultsTable.clientId, clientId),
          eq(examDocumentsTable.status, "conferido"),
        ),
      )
      .orderBy(examResultsTable.collectionDate, examResultsTable.id);
    const rows = joined.map((j) => j.result);

    // Colunas do comparativo: par unico (data + laboratorio), em ordem de data
    const columnKeys: string[] = [];
    const columns: Array<{ key: string; date: string | null; lab: string | null }> = [];
    for (const r of rows) {
      const key = `${r.collectionDate ?? "?"}|${r.labName ?? "?"}`;
      if (!columnKeys.includes(key)) {
        columnKeys.push(key);
        columns.push({ key, date: r.collectionDate, lab: r.labName });
      }
    }

    // Linhas: 1 por analito (codigo canonico quando casado; senao nome cru)
    interface Cell {
      value: string | null;
      valueNum: number | null;
      unit: string | null;
      status: string | null;
      documentId: number;
    }
    const lines = new Map<
      string,
      { name: string; unit: string | null; refLow: string | null; refHigh: string | null; cells: Map<string, Cell> }
    >();
    for (const r of rows) {
      const lineKey = r.analyteCode ?? r.analyteNameRaw.toLowerCase();
      if (!lines.has(lineKey)) {
        lines.set(lineKey, {
          name: r.analyteNameRaw,
          unit: r.unitCanonical ?? r.unitRaw,
          refLow: r.refLow,
          refHigh: r.refHigh,
          cells: new Map(),
        });
      }
      const line = lines.get(lineKey)!;
      const colKey = `${r.collectionDate ?? "?"}|${r.labName ?? "?"}`;
      // ultimo escrito vence (documento mais novo re-confirma o valor)
      line.cells.set(colKey, {
        value: r.valueRaw,
        valueNum: r.valueCanonical === null ? null : Number(r.valueCanonical),
        unit: r.unitRaw,
        status: r.status,
        documentId: r.examDocumentId,
      });
    }

    const analytes = [...lines.entries()].map(([key, line]) => {
      // tendencia: compara os 2 ultimos valores numericos
      const nums = columns
        .map((c) => line.cells.get(c.key)?.valueNum)
        .filter((v): v is number => v !== null && v !== undefined);
      let trend: "subiu" | "caiu" | "estavel" | null = null;
      if (nums.length >= 2) {
        const prev = nums[nums.length - 2];
        const last = nums[nums.length - 1];
        trend = last > prev ? "subiu" : last < prev ? "caiu" : "estavel";
      }
      return {
        key,
        name: line.name,
        unit: line.unit,
        refLow: line.refLow,
        refHigh: line.refHigh,
        trend,
        cells: Object.fromEntries(line.cells),
      };
    });

    analytes.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    res.json({ columns, analytes });
  } catch (err) {
    console.error("[ExamesLab] Erro na evolucao:", (err as Error).message);
    res.status(500).json({ error: "Erro ao montar evolucao" });
  }
});

export default router;
