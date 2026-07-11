import { Router, type IRouter, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import multer from "multer";
import {
  db,
  examDocumentsTable,
  examResultsTable,
  examAnalyteCatalogTable,
  examAnalyteRangesTable,
  direcaoFavoravelExameTable,
  clientsTable,
  professionalsTable,
} from "@workspace/db";
import { eq, ne, desc, and, or, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  resolveDirection,
  computeZones,
  overrideZones,
  classifyIntoZones,
  type Direction,
  type Zone,
} from "../lib/exam-extraction/zones";
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
    // Documentos "ignorado" (nao-exame filtrado pelo porteiro da importacao em
    // massa) nao aparecem na tela de exames — servem so de dedup de custo.
    const notIgnored = ne(examDocumentsTable.status, "ignorado");
    const docs = clientId
      ? await base
          .where(and(eq(examDocumentsTable.clientId, clientId), notIgnored))
          .orderBy(desc(examDocumentsTable.id))
      : await base.where(notIgnored).orderBy(desc(examDocumentsTable.id));

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

    // ---- Motor de FAIXAS (5 zonas): direção real + trisecção do min/max real --
    // Direção: 1) exam_analyte_catalog.direction; 2) direcao_favoravel_exame
    // (transmutado do IHE, casado pelo nome); 3) target (neutro). Faixas
    // explícitas do Subcadastro (exam_analyte_ranges) mandam quando existirem.
    const catRows = await db
      .select({ code: examAnalyteCatalogTable.code, direction: examAnalyteCatalogTable.direction })
      .from(examAnalyteCatalogTable);
    const dirByCode = new Map<string, string | null>();
    for (const c of catRows) dirByCode.set(c.code, c.direction);

    const dirRows = await db
      .select({
        nome: direcaoFavoravelExameTable.nomeExame,
        dir: direcaoFavoravelExameTable.direcaoFavoravel,
      })
      .from(direcaoFavoravelExameTable);
    const norm = (s: string) => removeDiacritics(s).trim().toUpperCase();
    const dirByName = new Map<string, string | null>();
    for (const d of dirRows) dirByName.set(norm(d.nome), d.dir);

    const rangeRows = await db.select().from(examAnalyteRangesTable);
    const rangesByCode = new Map<string, typeof rangeRows>();
    for (const r of rangeRows) {
      const arr = rangesByCode.get(r.analyteCode) ?? [];
      arr.push(r);
      rangesByCode.set(r.analyteCode, arr);
    }

    const toNum = (s: string | null): number | null => {
      if (s === null) return null;
      const n = Number(String(s).replace(",", "."));
      return Number.isFinite(n) ? n : null;
    };

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

      // Direção do exame (código canônico primeiro; senão pelo nome cru).
      const catalogDir = key ? (dirByCode.get(key) ?? null) : null;
      const iheDir = dirByName.get(norm(line.name)) ?? null;
      const direction: Direction = resolveDirection(catalogDir, iheDir);

      // Zonas: override do Subcadastro OU trisecção do min/max real.
      const overrideRows = (rangesByCode.get(key) ?? []).map((r) => ({
        faixaName: r.faixaName,
        low: toNum(r.low),
        high: toNum(r.high),
        color: r.color,
        ordem: r.ordem,
      }));
      const zones: Zone[] | null =
        overrideZones(overrideRows) ??
        computeZones(toNum(line.refLow), toNum(line.refHigh), direction);

      // Classifica cada célula na sua zona (cor honesta da faixa).
      const cellsObj = Object.fromEntries(
        [...line.cells.entries()].map(([ck, cell]) => {
          const z = classifyIntoZones(cell.valueNum, zones);
          return [
            ck,
            { ...cell, zone: z ? { key: z.key, name: z.name, color: z.color } : null },
          ];
        }),
      );

      return {
        key,
        name: line.name,
        unit: line.unit,
        refLow: line.refLow,
        refHigh: line.refHigh,
        direction,
        zones: zones
          ? zones.map((z) => ({ key: z.key, name: z.name, color: z.color, low: z.low, high: z.high }))
          : null,
        trend,
        cells: cellsObj,
      };
    });

    analytes.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    res.json({ columns, analytes });
  } catch (err) {
    console.error("[ExamesLab] Erro na evolucao:", (err as Error).message);
    res.status(500).json({ error: "Erro ao montar evolucao" });
  }
});

// ===========================================================================
// CRUD das FAIXAS por exame (bloco editável do painel EVOLUÇÃO).
// Sem auth nova — segue o padrão single-tenant/proxy dos demais routers admin.
// A direção grava em exam_analyte_catalog.direction (upsert quando há code);
// as zonas gravam em exam_analyte_ranges (delete+insert por analyteCode).
// ===========================================================================

// GET faixas de um analito: direção resolvida + min/max do laudo mais recente +
// zonas (override do Subcadastro OU trisecção) + se há override salvo.
// Código vai por QUERY (?code=...) — analitos têm `%`, espaço e `/` no nome,
// que quebram o casamento de rota do Express/proxy quando vão no path.
router.get("/exames-lab/faixas", async (req: Request, res: Response) => {
  try {
    const code = String(req.query.code || "").trim();
    if (!code) return res.status(400).json({ error: "code obrigatório" });

    // Catálogo (displayName + direção salva) — casa por code.
    const [cat] = await db
      .select()
      .from(examAnalyteCatalogTable)
      .where(eq(examAnalyteCatalogTable.code, code))
      .limit(1);

    // Último resultado (por code OU por nome cru minúsculo) para o min/max real.
    const [latest] = await db
      .select({
        name: examResultsTable.analyteNameRaw,
        refLow: examResultsTable.refLow,
        refHigh: examResultsTable.refHigh,
      })
      .from(examResultsTable)
      .where(
        or(
          eq(examResultsTable.analyteCode, code),
          sql`lower(${examResultsTable.analyteNameRaw}) = ${code.toLowerCase()}`,
        ),
      )
      .orderBy(desc(examResultsTable.id))
      .limit(1);

    const displayName = cat?.displayName ?? latest?.name ?? code;

    // Direção pelo IHE (casa por nome). Normalização robusta em JS (mesma
    // estratégia do endpoint de evolução): remove acentos dos DOIS lados, pois
    // o `upper()` do Postgres não remove diacríticos e nomes acentuados falham.
    const norm = (s: string) => removeDiacritics(s).trim().toUpperCase();
    const nameForDir = norm(displayName);
    const dirRows = await db
      .select({
        nome: direcaoFavoravelExameTable.nomeExame,
        dir: direcaoFavoravelExameTable.direcaoFavoravel,
      })
      .from(direcaoFavoravelExameTable);
    const iheDir = dirRows.find((d) => norm(d.nome) === nameForDir)?.dir ?? null;
    const direction: Direction = resolveDirection(cat?.direction ?? null, iheDir);

    const toNum = (s: string | null): number | null => {
      if (s === null || s === undefined) return null;
      const n = Number(String(s).replace(",", "."));
      return Number.isFinite(n) ? n : null;
    };
    const refLow = toNum(latest?.refLow ?? null);
    const refHigh = toNum(latest?.refHigh ?? null);

    const ovRows = await db
      .select()
      .from(examAnalyteRangesTable)
      .where(eq(examAnalyteRangesTable.analyteCode, code));
    const override = overrideZones(
      ovRows.map((r) => ({
        faixaName: r.faixaName,
        low: toNum(r.low),
        high: toNum(r.high),
        color: r.color,
        ordem: r.ordem,
      })),
    );
    const zones: Zone[] | null = override ?? computeZones(refLow, refHigh, direction);

    return res.json({
      analyteCode: code,
      displayName,
      direction,
      refLow,
      refHigh,
      hasOverride: !!override,
      zones: zones
        ? zones.map((z) => ({ key: z.key, name: z.name, color: z.color, low: z.low, high: z.high }))
        : null,
    });
  } catch (e) {
    req.log?.error({ err: e }, "GET /faixas falhou");
    return res.status(500).json({ error: "Falha ao carregar faixas" });
  }
});

const faixaZonaSchema = z.object({
  faixaName: z.string().min(1).max(40),
  low: z.number().nullable(),
  high: z.number().nullable(),
  color: z.string().min(1).max(20),
  ordem: z.number().int().min(0),
});
const putFaixasSchema = z.object({
  direction: z.enum(["higher_better", "lower_better", "target"]).optional(),
  zones: z.array(faixaZonaSchema).max(5).optional(),
  // displayName: nome do exame para casar/gravar a direção em
  // direcao_favoravel_exame (a fonte REAL que o motor lê). Sem ele, derivamos
  // do último resultado do laudo (mesma estratégia do GET).
  displayName: z.string().min(1).max(160).optional(),
  // resetDirection: apaga a direção customizada (direcao_favoravel_exame por
  // nome + catálogo) para voltar ao padrão. Usado no "Restaurar".
  resetDirection: z.boolean().optional(),
});

// Tradução da direção do motor para o vocabulário da tabela do IHE.
const DIR_TO_IHE: Record<Direction, string> = {
  higher_better: "SUBIR_BOM",
  lower_better: "DESCER_BOM",
  target: "ALVO",
};

// PUT faixas: grava a DIREÇÃO em direcao_favoravel_exame (upsert por nome
// normalizado — a fonte que o motor consulta) e substitui as zonas.
router.put("/exames-lab/faixas", async (req: Request, res: Response) => {
  try {
    const code = String(req.query.code || "").trim();
    if (!code) return res.status(400).json({ error: "code obrigatório" });

    const parsed = putFaixasSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    }
    const { direction, zones, resetDirection } = parsed.data;

    // Nome do exame que casa a direção: displayName do corpo OU derivado do
    // último resultado real (por code OU nome cru minúsculo) OU o próprio code.
    let displayName = (parsed.data.displayName ?? "").trim();
    if (!displayName) {
      const [latest] = await db
        .select({ name: examResultsTable.analyteNameRaw })
        .from(examResultsTable)
        .where(
          or(
            eq(examResultsTable.analyteCode, code),
            sql`lower(${examResultsTable.analyteNameRaw}) = ${code.toLowerCase()}`,
          ),
        )
        .orderBy(desc(examResultsTable.id))
        .limit(1);
      displayName = latest?.name ?? code;
    }
    const norm = (s: string) => removeDiacritics(s).trim().toUpperCase();
    const nomeNorm = norm(displayName);

    let directionSaved = false;
    // Todas as linhas de direção (tabela pequena) para casar por nome normalizado.
    const dirAll = await db
      .select({ id: direcaoFavoravelExameTable.id, nome: direcaoFavoravelExameTable.nomeExame })
      .from(direcaoFavoravelExameTable);

    if (resetDirection) {
      // Volta ao padrão: apaga as linhas de direção que casam por nome + limpa
      // o catálogo (compat).
      const alvo = dirAll.filter((d) => norm(d.nome) === nomeNorm).map((d) => d.id);
      if (alvo.length) {
        await db
          .delete(direcaoFavoravelExameTable)
          .where(inArray(direcaoFavoravelExameTable.id, alvo));
      }
      await db
        .update(examAnalyteCatalogTable)
        .set({ direction: null })
        .where(eq(examAnalyteCatalogTable.code, code));
    } else if (direction) {
      const ihe = DIR_TO_IHE[direction];
      const existente = dirAll.find((d) => norm(d.nome) === nomeNorm);
      if (existente) {
        await db
          .update(direcaoFavoravelExameTable)
          .set({ direcaoFavoravel: ihe })
          .where(eq(direcaoFavoravelExameTable.id, existente.id));
      } else {
        await db
          .insert(direcaoFavoravelExameTable)
          .values({ nomeExame: displayName, direcaoFavoravel: ihe, grupoExame: "MANUAL" });
      }
      directionSaved = true;
      // Compat: se houver linha no catálogo, grava a direção lá também.
      await db
        .update(examAnalyteCatalogTable)
        .set({ direction })
        .where(eq(examAnalyteCatalogTable.code, code));
    }

    if (zones) {
      await db.delete(examAnalyteRangesTable).where(eq(examAnalyteRangesTable.analyteCode, code));
      if (zones.length) {
        await db.insert(examAnalyteRangesTable).values(
          zones.map((z, i) => ({
            analyteCode: code,
            faixaName: z.faixaName,
            low: z.low === null ? null : String(z.low),
            high: z.high === null ? null : String(z.high),
            color: z.color,
            ordem: z.ordem ?? i + 1,
          })),
        );
      }
    }

    return res.json({ ok: true, analyteCode: code, directionSaved, zonesSaved: zones?.length ?? 0 });
  } catch (e) {
    req.log?.error({ err: e }, "PUT /faixas falhou");
    return res.status(500).json({ error: "Falha ao salvar faixas" });
  }
});

// ===========================================================================
// GET /exames-lab/direcoes — lista consolidada para a TELA DE CADASTRO de
// direção (menu Cadastros + Cockpit). Une (a) a curadoria de direção
// (direcao_favoravel_exame) com (b) os analitos REAIS dos laudos (exam_results),
// consolidando variações de caixa por nome normalizado. Cada item traz a
// direção RESOLVIDA (higher/lower/target), o grupo, a contagem de resultados e
// se já tem direção explícita cadastrada.
// ===========================================================================
router.get("/exames-lab/direcoes", async (req: Request, res: Response) => {
  try {
    const norm = (s: string) => removeDiacritics(s).trim().toUpperCase();

    const dirRows = await db
      .select({
        nome: direcaoFavoravelExameTable.nomeExame,
        dir: direcaoFavoravelExameTable.direcaoFavoravel,
        grupo: direcaoFavoravelExameTable.grupoExame,
      })
      .from(direcaoFavoravelExameTable);
    const dirByNorm = new Map<string, { dir: string | null; grupo: string | null }>();
    for (const d of dirRows) dirByNorm.set(norm(d.nome), { dir: d.dir, grupo: d.grupo });

    // Exames reais por frequência (nome cru do laudo).
    const reais = await db
      .select({ name: examResultsTable.analyteNameRaw, n: sql<number>`count(*)` })
      .from(examResultsTable)
      .groupBy(examResultsTable.analyteNameRaw);

    // Consolida por nome normalizado (agrupa variações de caixa). Guarda o nome
    // de exibição mais CURTO (costuma ser o canônico) e soma as contagens.
    const mapa = new Map<string, { displayName: string; count: number }>();
    for (const r of reais) {
      if (!r.name) continue;
      const k = norm(r.name);
      const n = Number(r.n) || 0;
      const cur = mapa.get(k);
      if (cur) {
        cur.count += n;
        if (r.name.length < cur.displayName.length) cur.displayName = r.name;
      } else {
        mapa.set(k, { displayName: r.name, count: n });
      }
    }
    // Inclui exames curados que ainda não apareceram em nenhum laudo.
    for (const d of dirRows) {
      const k = norm(d.nome);
      if (!mapa.has(k)) mapa.set(k, { displayName: d.nome, count: 0 });
    }

    const lista = [...mapa.entries()].map(([k, v]) => {
      const d = dirByNorm.get(k);
      return {
        code: v.displayName.toLowerCase(),
        displayName: v.displayName,
        direction: resolveDirection(null, d?.dir ?? null),
        grupo: d?.grupo ?? null,
        count: v.count,
        hasDirection: !!d?.dir,
      };
    });
    lista.sort(
      (a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName, "pt-BR"),
    );

    return res.json(lista);
  } catch (e) {
    req.log?.error({ err: e }, "GET /direcoes falhou");
    return res.status(500).json({ error: "Falha ao listar direções" });
  }
});

export default router;
