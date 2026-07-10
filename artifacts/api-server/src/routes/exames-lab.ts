import { Router, type IRouter, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import multer from "multer";
import {
  db,
  examDocumentsTable,
  examResultsTable,
  clientsTable,
  professionalsTable,
} from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { getSetting } from "../lib/secure-settings";
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

// Rotulo humano do cargo a partir da categoria funcional (usado quando o
// profissional nao tem `role`/cargo preenchido). So para snapshot de auditoria.
const CATEGORY_LABEL: Record<string, string> = {
  medico: "Médico(a)",
  enfermagem: "Enfermagem",
  recepcao: "Recepção",
  administrativo: "Administrativo",
  financeiro: "Financeiro",
  outro: "Colaborador(a)",
};

function cargoLabel(role: string | null, category: string | null): string {
  const r = (role ?? "").trim();
  if (r) return r;
  return CATEGORY_LABEL[category ?? "outro"] ?? "Colaborador(a)";
}

// recebido -> ia (só a IA leu) | conferido_1 -> c1 (conferência operacional) |
// conferido -> c2 (conferência clínica = liberado).
function confLevelFromStatus(status: string): "ia" | "c1" | "c2" | null {
  if (status === "recebido") return "ia";
  if (status === "conferido_1") return "c1";
  if (status === "conferido") return "c2";
  return null;
}

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
        conf1Name: examDocumentsTable.conf1Name,
        conf1Cargo: examDocumentsTable.conf1Cargo,
        conf1At: examDocumentsTable.conf1At,
        conf2Name: examDocumentsTable.conf2Name,
        conf2Cargo: examDocumentsTable.conf2Cargo,
        conf2At: examDocumentsTable.conf2At,
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

// ---- PATCH /exames-lab/documentos/:id/conferir — conferencia humana em 2 fases ----
// Body: { fase: 1 | 2, professionalId: number }.
//   fase 1 (C1, operacional): recebido -> conferido_1. Grava conf1* (snapshot).
//   fase 2 (C2, clinica = liberado): conferido_1 -> conferido. Grava conf2* + conferredAt.
// O conferente e sempre gravado como SNAPSHOT (nome + cargo do momento), para o
// CEO poder renomear os ficticios depois sem perder o registro de auditoria.
router.patch(
  "/exames-lab/documentos/:id/conferir",
  async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const fase = Number(req.body?.fase);
      const professionalId = Number(req.body?.professionalId);
      if (fase !== 1 && fase !== 2) {
        res.status(400).json({ error: "fase deve ser 1 (operacional) ou 2 (clinica)" });
        return;
      }
      if (!Number.isInteger(professionalId) || professionalId <= 0) {
        res.status(400).json({ error: "professionalId (conferente) e obrigatorio" });
        return;
      }

      const docs = await db
        .select({ id: examDocumentsTable.id, status: examDocumentsTable.status })
        .from(examDocumentsTable)
        .where(eq(examDocumentsTable.id, id));
      if (docs.length === 0) {
        res.status(404).json({ error: "Documento nao encontrado" });
        return;
      }
      const status = docs[0].status;
      if (status === "processando") {
        res.status(409).json({ error: "Documento ainda em processamento" });
        return;
      }
      if (status === "erro") {
        res.status(409).json({ error: "Documento com erro de leitura; nao pode ser conferido" });
        return;
      }

      // Snapshot do conferente (nome + cargo do momento).
      const [prof] = await db
        .select({
          id: professionalsTable.id,
          name: professionalsTable.name,
          role: professionalsTable.role,
          category: professionalsTable.category,
        })
        .from(professionalsTable)
        .where(eq(professionalsTable.id, professionalId))
        .limit(1);
      if (!prof) {
        res.status(404).json({ error: "Conferente nao encontrado" });
        return;
      }
      const cargo = cargoLabel(prof.role, prof.category);
      const now = new Date();

      if (fase === 1) {
        if (status !== "recebido") {
          res.status(409).json({
            error: "A conferencia operacional (C1) so vale quando o documento esta 'recebido'",
          });
          return;
        }
        await db
          .update(examDocumentsTable)
          .set({
            status: "conferido_1",
            conf1ProfessionalId: prof.id,
            conf1Name: prof.name,
            conf1Cargo: cargo,
            conf1At: now,
          })
          .where(eq(examDocumentsTable.id, id));
        res.json({ ok: true, status: "conferido_1" });
        return;
      }

      // fase === 2
      if (status !== "conferido_1") {
        res.status(409).json({
          error: "Faca a conferencia operacional (C1) antes da conferencia clinica (C2)",
        });
        return;
      }
      await db
        .update(examDocumentsTable)
        .set({
          status: "conferido",
          conf2ProfessionalId: prof.id,
          conf2Name: prof.name,
          conf2Cargo: cargo,
          conf2At: now,
          conferredAt: now,
        })
        .where(eq(examDocumentsTable.id, id));
      res.json({ ok: true, status: "conferido" });
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
    // Toggle global "liberar validacoes" (exames.exigirValidacaoHumana):
    //   LIGADO (padrao seguro): so entram resultados de documentos CONFERIDOS (C2).
    //   DESLIGADO: entram todos que a IA ja leu (menos processando/erro), para o
    //   CEO ver a evolucao antes da conferencia humana. Afeta SO a Evolucao.
    const rawToggle = await getSetting("exames.exigirValidacaoHumana");
    const exigirValidacao = rawToggle === null ? true : rawToggle === "true";
    const statusPermitidos = exigirValidacao
      ? ["conferido"]
      : ["recebido", "conferido_1", "conferido"];

    const joined = await db
      .select({
        result: examResultsTable,
        docStatus: examDocumentsTable.status,
        conf1Name: examDocumentsTable.conf1Name,
        conf1Cargo: examDocumentsTable.conf1Cargo,
        conf2Name: examDocumentsTable.conf2Name,
        conf2Cargo: examDocumentsTable.conf2Cargo,
      })
      .from(examResultsTable)
      .innerJoin(
        examDocumentsTable,
        eq(examResultsTable.examDocumentId, examDocumentsTable.id),
      )
      .where(
        and(
          eq(examResultsTable.clientId, clientId),
          inArray(examDocumentsTable.status, statusPermitidos),
        ),
      )
      .orderBy(examResultsTable.collectionDate, examResultsTable.id);
    const rows = joined.map((j) => j.result);

    // Selo por coluna (data + laboratorio): nivel de conferencia (ia/c1/c2) +
    // conferente (nome/cargo do snapshot). O documento mais novo (maior id) que
    // alimenta a coluna define o selo, alinhado com "ultimo escrito vence".
    interface ColSeal {
      docId: number;
      confLevel: "ia" | "c1" | "c2" | null;
      conferenteName: string | null;
      conferenteCargo: string | null;
    }
    const seals = new Map<string, ColSeal>();
    for (const j of joined) {
      const r = j.result;
      const key = `${r.collectionDate ?? "?"}|${r.labName ?? "?"}`;
      const prev = seals.get(key);
      if (prev && prev.docId >= r.examDocumentId) continue;
      const level = confLevelFromStatus(j.docStatus);
      // C2: usa snapshot da fase 2 (documentos legados sem snapshot => "conferencia legada").
      // C1: usa snapshot da fase 1. IA: sem conferente.
      let conferenteName: string | null = null;
      let conferenteCargo: string | null = null;
      if (level === "c2") {
        conferenteName = j.conf2Name ?? (j.docStatus === "conferido" ? "Conferência legada" : null);
        conferenteCargo = j.conf2Cargo;
      } else if (level === "c1") {
        conferenteName = j.conf1Name;
        conferenteCargo = j.conf1Cargo;
      }
      seals.set(key, {
        docId: r.examDocumentId,
        confLevel: level,
        conferenteName,
        conferenteCargo,
      });
    }

    // Colunas do comparativo: par unico (data + laboratorio), em ordem de data
    const columnKeys: string[] = [];
    const columns: Array<{
      key: string;
      date: string | null;
      lab: string | null;
      confLevel: "ia" | "c1" | "c2" | null;
      conferenteName: string | null;
      conferenteCargo: string | null;
    }> = [];
    for (const r of rows) {
      const key = `${r.collectionDate ?? "?"}|${r.labName ?? "?"}`;
      if (!columnKeys.includes(key)) {
        columnKeys.push(key);
        const seal = seals.get(key);
        columns.push({
          key,
          date: r.collectionDate,
          lab: r.labName,
          confLevel: seal?.confLevel ?? null,
          conferenteName: seal?.conferenteName ?? null,
          conferenteCargo: seal?.conferenteCargo ?? null,
        });
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
