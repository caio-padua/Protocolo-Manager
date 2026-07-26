import { Router, type IRouter, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import multer from "multer";
import {
  db,
  examDocumentsTable,
  examResultsTable,
  examAnalyteCatalogTable,
  examAnalyteRangesTable,
  examAnalyteUnitsTable,
  direcaoFavoravelExameTable,
  clientsTable,
  professionalsTable,
} from "@workspace/db";
import { eq, ne, desc, and, or, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import { resolveEmpresaId } from "../middleware/tenantContext";
import { z } from "zod/v4";
import {
  resolveDirection,
  computeZones,
  overrideZones,
  classifyIntoZones,
  chaveFaixa,
  chaveVariante,
  VARIANTE_MIN,
  type Direction,
  type Zone,
} from "../lib/exam-extraction/zones";
import { getSetting } from "../lib/secure-settings";
import { saveInternalCopy, hasInternalCopy, getInternalCopy } from "../lib/exam-file-store";
import { requireCollaborator } from "./collaborator";
import { extractPdfText } from "../lib/exam-extraction/pdf-text";
import { extractExamFromText, extractExamFromMedia } from "../lib/exam-extraction/extract";
import { extractExamWithClaude, CLAUDE_MODEL_NAME } from "../lib/exam-extraction/extract-anthropic";
import { extractExamWithOpenAI, OPENAI_MODEL } from "../lib/exam-extraction/extract-openai";
import type { ExtractedExam } from "../lib/exam-extraction/schema";
import {
  persistExtractedResults,
  finalizeDocument,
  markDocumentError,
  normUnit,
  normalizeAnalyteName,
} from "../lib/exam-extraction/persist";
import {
  ensureClientFolderStructure,
  uploadFileToDrive,
  removeDiacritics,
  driveDownloadFile,
  driveListChildren,
  driveCopyFileInFolder,
  renameDriveFile,
} from "../lib/google-drive";
import { logger } from "../lib/logger";
import {
  runTriagemBackfill,
  loadCatalogFull,
  absorbAsAlias,
  createDiscoveredExam,
  setResultCodeForRaw,
  setResultCodeForNormKey,
  readTriagemOptions,
} from "../lib/exam-extraction/triagem";
import { runCuradoriaTriagem } from "../lib/exam-extraction/seed-triagem-curadoria";
import { examAnalyteTriagemTable } from "@workspace/db";
import {
  englobarExame,
  transferirResultados,
  desfazerLote,
  impactoExame,
  listarLotes,
  ReassignError,
} from "../lib/exam-extraction/reassign";
import { sendWhatsapp } from "../lib/whatsapp";
import { sendGmailMessage } from "../lib/google-gmail";
import { moduleGuard } from "../middleware/moduleGuard";

const router: IRouter = Router();
router.use(moduleGuard("exames_lab"));

/** Deduz o mime-type pela extensão do nome do arquivo. */
export function guessMime(fileName: string): string {
  const ext = (fileName.match(/\.(\w+)$/)?.[1] ?? "").toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}
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
  /**
   * Prefixo de data YY.MM.DD que o usuário forneceu no formulário de upload.
   * Após a extração por IA, se a data real do exame diferir, o arquivo no
   * Drive é renomeado automaticamente (5d: data extraída prevalece).
   */
  userDateStr?: string | null;
}

/** Converte data do exame DD/MM/AAAA (retornada pela IA) para prefixo YY.MM.DD. */
function collectionDateToPrefix(brDate: string | null | undefined): string | null {
  if (!brDate) return null;
  const m = brDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy.slice(2)}.${mm}.${dd}`;
}

// ─── Tipos para o pipeline multi-IA ──────────────────────────────────────────
interface LlmStep {
  provider: string;
  model: string;
  ok: boolean;
  analitos?: number;
  ms?: number;
  error?: string;
}

/** Mescla analitos de dois resultados (union por nome normalizado). */
function mergeExtractions(base: ExtractedExam, extra: ExtractedExam): ExtractedExam {
  const baseNames = new Set(
    (base.tests ?? []).map((t) => (t.name ?? "").toLowerCase().trim()),
  );
  const novos = (extra.tests ?? []).filter(
    (t) => !baseNames.has((t.name ?? "").toLowerCase().trim()),
  );
  return { ...base, tests: [...(base.tests ?? []), ...novos] };
}

/** Persiste resultado + pipeline multi-IA no banco (raw SQL para evitar db push). */
async function finalizeDocumentWithPipeline(
  documentId: number,
  extracted: ExtractedExam,
  modelUsed: string,
  pipeline: LlmStep[],
): Promise<void> {
  await finalizeDocument(documentId, extracted, modelUsed);
  // Grava pipeline em coluna adicionada via ALTER TABLE (fora do schema Drizzle)
  await db.execute(sql`
    UPDATE exam_documents
    SET llm_pipeline = ${JSON.stringify(pipeline)}::jsonb
    WHERE id = ${documentId}
  `);
}

/** Processa 1 documento: texto -> IA(s) -> banco -> Drive -> aviso. */
export async function processExamDocument(job: IngestJobInput): Promise<void> {
  const { documentId, clientId, buffer, fileName } = job;
  try {
    const pdfText = await extractPdfText(buffer);

    // Lê configuração de LLMs ativos (fire todos em paralelo para latência mínima)
    const [geminiSetting, claudeSetting, openaiSetting] = await Promise.all([
      getSetting("exames.llmGeminiAtivo"),
      getSetting("exames.llmClaudeAtivo"),
      getSetting("exames.llmOpenaiAtivo"),
    ]);
    const llmGeminiAtivo = geminiSetting === null ? true : geminiSetting === "true";
    const llmClaudeAtivo = claudeSetting === null ? false : claudeSetting === "true";
    const llmOpenaiAtivo = openaiSetting === null ? false : openaiSetting === "true";

    const llmPipeline: LlmStep[] = [];
    let mergedData: ExtractedExam | null = null;
    let primaryModel = "gemini-2.5-flash";

    // ── Passo 1: Gemini ──────────────────────────────────────────────────────
    if (llmGeminiAtivo) {
      const t0 = Date.now();
      try {
        const { data, modelUsed } = await extractExamFromText(pdfText.text);
        primaryModel = modelUsed;
        mergedData = data;
        llmPipeline.push({
          provider: "gemini",
          model: modelUsed,
          ok: true,
          analitos: data.tests?.length ?? 0,
          ms: Date.now() - t0,
        });
      } catch (err: any) {
        llmPipeline.push({
          provider: "gemini",
          model: "gemini-2.5-flash",
          ok: false,
          error: err.message,
          ms: Date.now() - t0,
        });
      }
    }

    // ── Passo 2: Claude (encadeado se ativo) ─────────────────────────────────
    if (llmClaudeAtivo) {
      const claudeResult = await extractExamWithClaude(pdfText.text);
      if (claudeResult) {
        if (mergedData) {
          mergedData = mergeExtractions(mergedData, claudeResult.data);
        } else {
          mergedData = claudeResult.data;
          primaryModel = CLAUDE_MODEL_NAME;
        }
        llmPipeline.push({
          provider: "claude",
          model: CLAUDE_MODEL_NAME,
          ok: true,
          analitos: claudeResult.data.tests?.length ?? 0,
          ms: claudeResult.ms,
        });
      } else {
        llmPipeline.push({
          provider: "claude",
          model: CLAUDE_MODEL_NAME,
          ok: false,
          error: "Não disponível (verifique AI_INTEGRATIONS_ANTHROPIC_*)",
        });
      }
    }

    // ── Passo 3: OpenAI (encadeado se ativo) ─────────────────────────────────
    if (llmOpenaiAtivo) {
      const openaiResult = await extractExamWithOpenAI(pdfText.text);
      if (openaiResult) {
        if (mergedData) {
          mergedData = mergeExtractions(mergedData, openaiResult.data);
        } else {
          mergedData = openaiResult.data;
          primaryModel = OPENAI_MODEL;
        }
        llmPipeline.push({
          provider: "openai",
          model: OPENAI_MODEL,
          ok: true,
          analitos: openaiResult.data.tests?.length ?? 0,
          ms: openaiResult.ms,
        });
      } else {
        llmPipeline.push({
          provider: "openai",
          model: OPENAI_MODEL,
          ok: false,
          error: "Não disponível (verifique AI_INTEGRATIONS_OPENAI_API_KEY)",
        });
      }
    }

    if (!mergedData) {
      throw new Error("Nenhum LLM ativo conseguiu processar o documento");
    }

    const data = mergedData;
    const modelUsed = primaryModel;

    await finalizeDocumentWithPipeline(documentId, data, modelUsed, llmPipeline);

    // 5b/5c/5d — Verificar data: se a IA encontrou data diferente da que o usuário
    // digitou, renomear o arquivo no Drive para usar a data extraída (mais confiável).
    if (
      job.userDateStr &&
      job.sourcePdfDriveId &&
      data.collectionDate
    ) {
      const extractedPrefix = collectionDateToPrefix(data.collectionDate);
      if (extractedPrefix && extractedPrefix !== job.userDateStr) {
        const correctedName = fileName.replace(job.userDateStr, extractedPrefix);
        try {
          await renameDriveFile(job.sourcePdfDriveId, correctedName);
          await db
            .update(examDocumentsTable)
            .set({ fileName: correctedName })
            .where(eq(examDocumentsTable.id, documentId));
          console.log(
            `[ExamesLab] doc ${documentId}: data corrigida no Drive: "${job.userDateStr}" → "${extractedPrefix}" → ${correctedName}`,
          );
        } catch (renameErr: any) {
          console.error(
            `[ExamesLab] doc ${documentId}: falha ao renomear no Drive: ${renameErr.message}`,
          );
        }
      }
    }
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
  empresaId?: number | null;
  userDateStr?: string | null;
}): Promise<{ documentId: number; duplicate: boolean }> {
  const hash = createHash("sha256").update(params.buffer).digest("hex");

  // Idempotencia POR PACIENTE: mesmo arquivo em outro cliente gera doc proprio.
  // EXCECAO: se o doc existente tem status='erro', reprocessa em vez de ignorar.
  const existing = await db
    .select({ id: examDocumentsTable.id, status: examDocumentsTable.status })
    .from(examDocumentsTable)
    .where(
      and(
        eq(examDocumentsTable.clientId, params.clientId),
        eq(examDocumentsTable.hash, hash),
      ),
    );
  if (existing.length > 0) {
    const existingDoc = existing[0];
    // Onda B: garantir cópia interna mesmo em duplicado
    setImmediate(() => {
      void hasInternalCopy(existingDoc.id).then(async (ok) => {
        if (!ok) {
          await saveInternalCopy({
            documentId: existingDoc.id,
            fileName: params.fileName,
            mimeType: guessMime(params.fileName),
            buffer: params.buffer,
          });
        }
      }).catch(() => {});
    });
    // Se ja concluido ou ainda processando, retorna como duplicado sem fazer nada.
    if (existingDoc.status !== "erro") {
      return { documentId: existingDoc.id, duplicate: true };
    }
    // Se estava com erro: atualiza o Drive ID (se novo disponivel), reseta para
    // processando e dispara a extracao novamente.
    logger.info(
      { docId: existingDoc.id },
      "[ExamesLab] Duplicado com status=erro — reprocessando em vez de ignorar",
    );
    await db
      .update(examDocumentsTable)
      .set({
        status: "processando",
        ...(params.sourcePdfDriveId
          ? { sourcePdfDriveId: params.sourcePdfDriveId }
          : {}),
      })
      .where(eq(examDocumentsTable.id, existingDoc.id));
    setImmediate(() => {
      void processExamDocument({
        documentId: existingDoc.id,
        clientId: params.clientId,
        buffer: params.buffer,
        fileName: params.fileName,
        sourcePdfDriveId:
          params.sourcePdfDriveId ?? null,
        notify: params.notify ?? false,
        userDateStr: params.userDateStr ?? null,
      });
    });
    return { documentId: existingDoc.id, duplicate: false };
  }

  const [doc] = await db
    .insert(examDocumentsTable)
    .values({
      clientId: params.clientId,
      hash,
      fileName: params.fileName,
      status: "processando",
      // BUG-FIX: persistir o Drive ID imediatamente — se o servidor reiniciar
      // durante o setImmediate, o ID ainda estará no banco para recuperação.
      sourcePdfDriveId: params.sourcePdfDriveId ?? null,
      ...(params.empresaId != null ? { empresaId: params.empresaId } : {}),
    })
    .returning({ id: examDocumentsTable.id });

  // Onda B: cópia interna no cofre do sistema (fire-and-forget)
  setImmediate(() => {
    void saveInternalCopy({
      documentId: doc.id,
      fileName: params.fileName,
      mimeType: guessMime(params.fileName),
      buffer: params.buffer,
    });
  });

  setImmediate(() => {
    void processExamDocument({
      documentId: doc.id,
      clientId: params.clientId,
      buffer: params.buffer,
      fileName: params.fileName,
      sourcePdfDriveId: params.sourcePdfDriveId ?? null,
      notify: params.notify ?? false,
      userDateStr: params.userDateStr ?? null,
    });
  });

  return { documentId: doc.id, duplicate: false };
}

/**
 * Executado no boot do servidor: recupera documentos que ficaram presos no
 * status "processando" por causa de reinicializacao do servidor durante a
 * extracao (o setImmediate morreu junto com o processo anterior).
 *
 * Estrategia:
 * 1. Se o doc ja tem source_pdf_drive_id → baixa do Drive e reprocessa.
 * 2. Se nao tem → tenta achar o arquivo na pasta EXAMES do cliente no Drive.
 * 3. Se nao acha → marca como erro com mensagem orientando o reenvio.
 */
/** Extrai o prefixo YY.MM.DD do nome do arquivo, se existir. */
function extractDatePrefixFromFileName(fileName: string): string | null {
  const m = fileName.match(/^(\d{2}\.\d{2}\.\d{2})\s/);
  return m ? m[1] : null;
}

export async function recoverStuckDocuments(): Promise<void> {
  const cutoffMs = Date.now() - 5 * 60 * 1000;
  // BUG-FIX: também recupera docs em "erro" recentes (últimos 7 dias) —
  // podem ser erros de restart, não erros definitivos de PDF inválido.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const stuck = await db
    .select()
    .from(examDocumentsTable)
    .where(
      and(
        or(
          eq(examDocumentsTable.status, "processando"),
          and(
            eq(examDocumentsTable.status, "erro"),
            sql`${examDocumentsTable.createdAt} > ${sevenDaysAgo}`,
          ),
        ),
        sql`${examDocumentsTable.createdAt} < ${new Date(cutoffMs).toISOString()}`,
      ),
    );

  if (stuck.length === 0) return;

  logger.info({ count: stuck.length }, "[ExamesLab] Recuperando documentos presos em 'processando'");

  for (const doc of stuck) {
    try {
      let buffer: Buffer | null = null;
      let resolvedDriveId: string | null = doc.sourcePdfDriveId ?? null;

      if (resolvedDriveId) {
        buffer = await driveDownloadFile(resolvedDriveId);
      } else {
        const clients = await db
          .select()
          .from(clientsTable)
          .where(eq(clientsTable.id, doc.clientId));
        const client = clients[0];
        if (client) {
          try {
            const structure = await ensureClientFolderStructure(client.name, client.cpf);
            const examesFolderId = structure.subfolders["EXAMES"];
            if (examesFolderId) {
              const files = await driveListChildren(examesFolderId);
              const baseName = doc.fileName.replace(/\.[^.]+$/, "");
              const found = files.find(
                (f) =>
                  f.name.replace(/\.[^.]+$/, "") === baseName ||
                  f.name.includes(baseName) ||
                  baseName.includes(f.name.replace(/\.[^.]+$/, "")),
              );
              if (found) {
                resolvedDriveId = found.id;
                buffer = await driveDownloadFile(found.id);
                logger.info(
                  { docId: doc.id, fileId: found.id, name: found.name },
                  "[ExamesLab] Arquivo encontrado no Drive do cliente",
                );
              }
            }
          } catch (driveErr) {
            logger.warn(
              { err: (driveErr as Error).message, docId: doc.id },
              "[ExamesLab] Falha ao buscar no Drive do cliente",
            );
          }
        }
      }

      if (buffer) {
        const capturedBuffer = buffer;
        const capturedDriveId = resolvedDriveId;
        // BUG-FIX: extrair userDateStr do nome do arquivo salvo no banco
        // para que, após a extração, o renomeio da data no Drive funcione.
        const capturedUserDateStr = extractDatePrefixFromFileName(doc.fileName);
        // Resetar para "processando" antes do re-dispatch (era "erro")
        await db
          .update(examDocumentsTable)
          .set({ status: "processando", ...(capturedDriveId ? { sourcePdfDriveId: capturedDriveId } : {}) })
          .where(eq(examDocumentsTable.id, doc.id));
        setImmediate(() => {
          void processExamDocument({
            documentId: doc.id,
            clientId: doc.clientId,
            buffer: capturedBuffer,
            fileName: doc.fileName,
            sourcePdfDriveId: capturedDriveId,
            notify: true,
            userDateStr: capturedUserDateStr,
          });
        });
        logger.info({ docId: doc.id, userDateStr: capturedUserDateStr }, "[ExamesLab] Documento recuperado — processamento re-disparado");
      } else {
        await markDocumentError(
          doc.id,
          "Servidor reiniciado durante a extração e o arquivo não foi encontrado no Drive. Por favor reenvie o documento pelo portal.",
        );
        logger.warn({ docId: doc.id }, "[ExamesLab] Documento marcado como erro — arquivo não recuperável");
      }
    } catch (err) {
      logger.error({ err: (err as Error).message, docId: doc.id }, "[ExamesLab] Falha na recuperação do documento");
    }
  }
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
      const empresaId = resolveEmpresaId(req);
      const result = await startExamIngestion({
        clientId,
        buffer: file.buffer,
        fileName: file.originalname,
        notify,
        empresaId,
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
    const empresaId = resolveEmpresaId(req);
    const base = db
      .select({
        id: examDocumentsTable.id,
        clientId: examDocumentsTable.clientId,
        fileName: examDocumentsTable.fileName,
        labName: examDocumentsTable.labName,
        collectionDate: examDocumentsTable.collectionDate,
        status: examDocumentsTable.status,
        origin: examDocumentsTable.origin,
        sourcePdfDriveId: examDocumentsTable.sourcePdfDriveId,
        sourcePath: examDocumentsTable.sourcePath,
        examKind: examDocumentsTable.examKind,
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
    const tenantFilter = eq(examDocumentsTable.empresaId, empresaId);
    const docs = clientId
      ? await base
          .where(and(tenantFilter, eq(examDocumentsTable.clientId, clientId), notIgnored))
          .orderBy(desc(examDocumentsTable.id))
      : await base.where(and(tenantFilter, notIgnored)).orderBy(desc(examDocumentsTable.id));

    // nome do cliente + pasta Drive para exibicao
    const clientIds = [...new Set(docs.map((d) => d.clientId))];
    const clientInfo = new Map<number, { name: string; driveFolderId: string | null }>();
    for (const cid of clientIds) {
      const rows = await db
        .select({ id: clientsTable.id, name: clientsTable.name, driveFolderId: clientsTable.driveFolderId })
        .from(clientsTable)
        .where(eq(clientsTable.id, cid));
      if (rows[0]) clientInfo.set(cid, { name: rows[0].name, driveFolderId: rows[0].driveFolderId ?? null });
    }

    // dados do watcher (original_name, renamed_to, copied_drive_id, copied_name)
    // drive_watcher_files nao tem schema Drizzle — raw SQL
    type WatcherRow = {
      exam_document_id: number;
      original_name: string | null;
      renamed_to: string | null;
      copied_drive_id: string | null;
      copied_name: string | null;
    };
    const watcherMap = new Map<number, WatcherRow>();
    if (docs.length > 0) {
      const docIds = docs.map((d) => d.id);
      // docIds são inteiros vindos do banco — sql.raw é seguro aqui
      const { rows: wRows } = await db.execute<WatcherRow>(
        sql.raw(`SELECT exam_document_id, original_name, renamed_to, copied_drive_id, copied_name
                 FROM drive_watcher_files
                 WHERE exam_document_id IN (${docIds.join(",")})`)
      );
      for (const w of wRows) {
        if (w.exam_document_id) watcherMap.set(w.exam_document_id, w);
      }
    }

    res.json(
      docs.map((d) => {
        const w = watcherMap.get(d.id);
        return {
          ...d,
          clientName: clientInfo.get(d.clientId)?.name ?? `Cliente ${d.clientId}`,
          clientDriveFolderId: clientInfo.get(d.clientId)?.driveFolderId ?? null,
          originalName: w?.original_name ?? null,
          renamedTo: w?.renamed_to ?? null,
          copiedDriveId: w?.copied_drive_id ?? null,
          copiedName: w?.copied_name ?? null,
        };
      }),
    );
  } catch (err) {
    console.error("[ExamesLab] Erro ao listar documentos:", (err as Error).message);
    res.status(500).json({ error: "Erro ao listar documentos" });
  }
});

// ---- GET /exames-lab/resultados?clientId= — BULK: todos os analitos do cliente ----
// Permite ao front carregar documentos + analitos em 2 chamadas (N+1 evitado).
router.get("/exames-lab/resultados", async (req: Request, res: Response) => {
  try {
    const clientId = req.query.clientId ? Number(req.query.clientId) : null;
    if (!clientId || Number.isNaN(clientId)) {
      res.status(400).json({ error: "clientId obrigatorio" });
      return;
    }
    const results = await db
      .select({
        id: examResultsTable.id,
        examDocumentId: examResultsTable.examDocumentId,
        analyteCode: examResultsTable.analyteCode,
        analyteNameRaw: examResultsTable.analyteNameRaw,
        valueRaw: examResultsTable.valueRaw,
        unitRaw: examResultsTable.unitRaw,
        valueCanonical: examResultsTable.valueCanonical,
        unitCanonical: examResultsTable.unitCanonical,
        status: examResultsTable.status,
        collectionDate: examResultsTable.collectionDate,
        unitConverted: examResultsTable.unitConverted,
        isHistory: examResultsTable.isHistory,
        canonicalName: examAnalyteCatalogTable.displayName,
      })
      .from(examResultsTable)
      .leftJoin(
        examAnalyteCatalogTable,
        eq(examResultsTable.analyteCode, examAnalyteCatalogTable.code),
      )
      .where(eq(examResultsTable.clientId, clientId))
      .orderBy(examResultsTable.examDocumentId, examResultsTable.id);
    res.json(results);
  } catch (err) {
    console.error("[ExamesLab] Erro ao listar resultados bulk:", (err as Error).message);
    res.status(500).json({ error: "Erro ao listar resultados" });
  }
});

// ---- PATCH /exames-lab/documento/:id — editar metadados (labName, collectionDate) ----
router.patch("/exames-lab/documento/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) { res.status(400).json({ error: "id inválido" }); return; }
    const body = req.body as { labName?: string | null; collectionDate?: string | null };
    const patch: { labName?: string | null; collectionDate?: string | null } = {};
    if ("labName" in body) patch.labName = body.labName ?? null;
    if ("collectionDate" in body) patch.collectionDate = body.collectionDate ?? null;
    if (!Object.keys(patch).length) { res.json({ ok: true }); return; }
    await db.update(examDocumentsTable).set(patch).where(eq(examDocumentsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "[ExamesLab] Erro ao atualizar documento");
    res.status(500).json({ error: "Erro ao atualizar documento" });
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

    // Determina se uma coluna e inteiramente historica (todos os resultados
    // dela vieram do historico interno de outro laudo, nao de exame proprio).
    const colIsHistory = new Map<string, boolean>();
    for (const r of rows) {
      const key = `${r.collectionDate ?? "?"}|${r.labName ?? "?"}`;
      if (!r.isHistory) {
        colIsHistory.set(key, false);          // qualquer nao-historico torna a coluna real
      } else if (!colIsHistory.has(key)) {
        colIsHistory.set(key, true);           // primeiro encontrado: assume historico
      }
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
      isHistory: boolean;
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
          isHistory: colIsHistory.get(key) ?? false,
        });
      }
    }

    // Linhas: 1 por analito (codigo canonico quando casado; senao nome cru)
    interface Cell {
      value: string | null;
      valueNum: number | null;
      unit: string | null;
      unitConverted: boolean;
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
        // Quando houve conversao, mostra a NOSSA unidade (o valueNum ja e canonico).
        unit: r.unitConverted ? (r.unitCanonical ?? r.unitRaw) : r.unitRaw,
        unitConverted: !!r.unitConverted,
        status: r.status,
        documentId: r.examDocumentId,
      });
    }

    // ---- Motor de FAIXAS (5 zonas): direção real + trisecção do min/max real --
    // Direção: 1) exam_analyte_catalog.direction; 2) direcao_favoravel_exame
    // (transmutado do IHE, casado pelo nome); 3) target (neutro). Faixas
    // explícitas do Subcadastro (exam_analyte_ranges) mandam quando existirem.
    const catRows = await db
      .select({
        code: examAnalyteCatalogTable.code,
        direction: examAnalyteCatalogTable.direction,
        sexDependent: examAnalyteCatalogTable.sexDependent,
      })
      .from(examAnalyteCatalogTable);
    const dirByCode = new Map<string, string | null>();
    const sexDepByCode = new Map<string, boolean>();
    for (const c of catRows) {
      dirByCode.set(c.code, c.direction);
      sexDepByCode.set(c.code, c.sexDependent ?? false);
    }

    // Sexo do cliente (clients.ficha_clinica.sexo: 'M' | 'F') para escolher o
    // conjunto de faixas dos analitos sexo-dependentes. Fallback 'any'.
    const [clientRow] = await db
      .select({ ficha: clientsTable.fichaClinica })
      .from(clientsTable)
      .where(eq(clientsTable.id, clientId))
      .limit(1);
    const rawSexo = ((clientRow?.ficha as { sexo?: string } | null)?.sexo ?? "")
      .toString()
      .trim()
      .toUpperCase();
    const clientSex: "male" | "female" | null =
      rawSexo === "M" ? "male" : rawSexo === "F" ? "female" : null;

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
      const rk = chaveFaixa(r.analyteCode);
      const arr = rangesByCode.get(rk) ?? [];
      arr.push(r);
      rangesByCode.set(rk, arr);
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
      // Chave normalizada por NOME do exame (unifica Config <-> Cockpit e casa
      // com a semente), independente do code cru da linha.
      // Faixas: prefere a chave do CODE canonico da linha (casa a semente e os
      // sinonimos casados); cai para o nome cru quando a linha nao casou.
      const allRows =
        rangesByCode.get(chaveFaixa(key)) ??
        rangesByCode.get(chaveFaixa(line.name)) ??
        [];
      // Escolha do conjunto por sexo: analito sexo-dependente + sexo do cliente
      // conhecido usa 'male'/'female' (com fallback 'any' se aquele sexo estiver
      // vazio); caso contrario usa apenas a faixa geral 'any'.
      const isSexDep = key ? (sexDepByCode.get(key) ?? false) : false;
      const pickBySex = (() => {
        if (isSexDep && clientSex) {
          const bySex = allRows.filter((r) => r.sex === clientSex);
          if (bySex.length) return bySex;
        }
        return allRows.filter((r) => (r.sex ?? "any") === "any");
      })();
      const overrideRows = pickBySex.map((r) => ({
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
      .where(eq(examAnalyteRangesTable.analyteCode, chaveFaixa(code)));
    // Separa as faixas gravadas por dimensao de sexo ('any' | 'male' | 'female').
    const toZoneInput = (rows: typeof ovRows) =>
      rows.map((r) => ({
        faixaName: r.faixaName,
        low: toNum(r.low),
        high: toNum(r.high),
        color: r.color,
        ordem: r.ordem,
      }));
    const overrideAny = overrideZones(toZoneInput(ovRows.filter((r) => (r.sex ?? "any") === "any")));
    const overrideMale = overrideZones(toZoneInput(ovRows.filter((r) => r.sex === "male")));
    const overrideFemale = overrideZones(toZoneInput(ovRows.filter((r) => r.sex === "female")));
    const zones: Zone[] | null = overrideAny ?? computeZones(refLow, refHigh, direction);
    const mapZones = (zz: Zone[] | null) =>
      zz ? zz.map((z) => ({ key: z.key, name: z.name, color: z.color, low: z.low, high: z.high })) : null;

    return res.json({
      analyteCode: code,
      displayName,
      direction,
      refLow,
      refHigh,
      sexDependent: cat?.sexDependent ?? false,
      hasOverride: !!overrideAny,
      zones: mapZones(zones),
      zonesMale: mapZones(overrideMale),
      zonesFemale: mapZones(overrideFemale),
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
  // sex: dimensao de sexo das zonas gravadas ('any' padrao | 'male' | 'female').
  // O replace de faixas afeta SO o conjunto daquele sexo.
  sex: z.enum(["any", "male", "female"]).optional(),
  // sexDependent: liga/desliga o flag no catalogo (analito varia por sexo).
  sexDependent: z.boolean().optional(),
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
    const { direction, zones, resetDirection, sexDependent } = parsed.data;
    const sex = parsed.data.sex ?? "any";

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

    // Liga/desliga o flag sex_dependent no catalogo, se enviado.
    if (typeof sexDependent === "boolean") {
      await db
        .update(examAnalyteCatalogTable)
        .set({ sexDependent })
        .where(eq(examAnalyteCatalogTable.code, code));
    }

    if (zones) {
      const rangeKey = chaveFaixa(code);
      // Replace afeta SO o conjunto do sexo em questao (preserva os demais).
      await db
        .delete(examAnalyteRangesTable)
        .where(
          and(
            eq(examAnalyteRangesTable.analyteCode, rangeKey),
            eq(examAnalyteRangesTable.sex, sex),
          ),
        );
      if (zones.length) {
        await db.insert(examAnalyteRangesTable).values(
          zones.map((z, i) => ({
            analyteCode: rangeKey,
            faixaName: z.faixaName,
            low: z.low === null ? null : String(z.low),
            high: z.high === null ? null : String(z.high),
            color: z.color,
            ordem: z.ordem ?? i + 1,
            sex,
            source: "manual",
          })),
        );
      }
    }

    return res.json({ ok: true, analyteCode: code, directionSaved, zonesSaved: zones?.length ?? 0, sex });
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

// ===========================================================================
// PLANILHA GERAL de curadoria (unidade padrão + 5 faixas de TODOS os exames).
// GET  /exames-lab/catalogo-faixas — uma linha por exame: nome, direção,
//   unidade canônica, lista de unidades (dropdown), 5 cortes De/Até, flag
//   quantitativo e flag "tem edição manual".
// PUT  /exames-lab/catalogo-faixas — grava SÓ a unidade padrão escolhida no
//   dropdown (as faixas/direção continuam pelo PUT /faixas por code).
// A ferramenta mestre-detalhe (DirecaoExamesTool) segue intacta; esta é a
// visão em massa. As duas gravam no mesmo backend (mesma chave chaveFaixa).
// ===========================================================================
router.get("/exames-lab/catalogo-faixas", async (req: Request, res: Response) => {
  try {
    const norm = (s: string) => removeDiacritics(s).trim().toUpperCase();
    const toNum = (s: string | null): number | null => {
      if (s === null || s === undefined) return null;
      const n = Number(String(s).replace(",", "."));
      return Number.isFinite(n) ? n : null;
    };

    // Balde a exibir: por padrao so analitos de SANGUE ativos. ?kind=imaging|
    // body_composition|fragment mostra o balde pedido (independe do active).
    const kindFilter = String(req.query.kind || "").trim();
    const catWhere = kindFilter
      ? eq(examAnalyteCatalogTable.kind, kindFilter)
      : and(eq(examAnalyteCatalogTable.active, true), eq(examAnalyteCatalogTable.kind, "blood"));

    const [cats, unitRows, rangeRows, dirRows, reais] = await Promise.all([
      db.select().from(examAnalyteCatalogTable).where(catWhere),
      db.select().from(examAnalyteUnitsTable),
      db.select().from(examAnalyteRangesTable),
      db
        .select({
          nome: direcaoFavoravelExameTable.nomeExame,
          dir: direcaoFavoravelExameTable.direcaoFavoravel,
        })
        .from(direcaoFavoravelExameTable),
      db
        .select({ name: examResultsTable.analyteNameRaw, n: sql<number>`count(*)` })
        .from(examResultsTable)
        .groupBy(examResultsTable.analyteNameRaw),
    ]);

    // Unidades por analito (ordenadas), faixas por chave, direção por nome.
    const unitsByCode = new Map<string, typeof unitRows>();
    for (const u of unitRows) {
      const arr = unitsByCode.get(u.analyteCode) ?? [];
      arr.push(u);
      unitsByCode.set(u.analyteCode, arr);
    }
    const rangesByKey = new Map<string, typeof rangeRows>();
    for (const r of rangeRows) {
      const arr = rangesByKey.get(r.analyteCode) ?? [];
      arr.push(r);
      rangesByKey.set(r.analyteCode, arr);
    }
    const dirByNorm = new Map<string, string | null>();
    for (const d of dirRows) dirByNorm.set(norm(d.nome), d.dir);

    // Planilha em massa mostra UM conjunto (faixa geral 'any'); a curadoria por
    // sexo acontece no editor por analito (GET/PUT /faixas com ?sex=).
    const buildRanges = (key: string) =>
      (rangesByKey.get(key) ?? [])
        .filter((r) => (r.sex ?? "any") === "any")
        .slice()
        .sort((a, b) => a.ordem - b.ordem)
        .map((r) => ({
          faixaName: r.faixaName,
          low: toNum(r.low),
          high: toNum(r.high),
          color: r.color,
          ordem: r.ordem,
        }));
    const hasManual = (key: string) =>
      (rangesByKey.get(key) ?? []).some((r) => r.source === "manual");

    // Chaves conhecidas do catálogo (code + displayName + sinônimos) para não
    // duplicar linha quando o nome cru do laudo é sinônimo de um exame curado.
    // Usa TODO o catálogo (inclusive inativos: imagem/composição/fragmento) para
    // que nomes crus desses registros não ressurjam como "descobertos".
    const allCatNames = await db
      .select({
        code: examAnalyteCatalogTable.code,
        displayName: examAnalyteCatalogTable.displayName,
        synonyms: examAnalyteCatalogTable.synonyms,
      })
      .from(examAnalyteCatalogTable);
    const known = new Set<string>();
    for (const c of allCatNames) {
      known.add(chaveFaixa(c.code));
      known.add(chaveFaixa(c.displayName));
      for (const s of c.synonyms ?? []) known.add(chaveFaixa(s));
    }

    type Row = {
      code: string;
      displayName: string;
      direction: Direction;
      canonicalUnit: string | null;
      synonyms: string[];
      units: { unit: string; factorToCanonical: number | null; isCanonical: boolean; active: boolean }[];
      zones: { faixaName: string; low: number | null; high: number | null; color: string | null; ordem: number }[];
      quantitativo: boolean;
      hasManualEdit: boolean;
      inCatalog: boolean;
      origin: "catalogo" | "descoberto" | null;
      kind: string;
      sexDependent: boolean;
    };

    const rows: Row[] = cats.map((c) => {
      const units = (unitsByCode.get(c.code) ?? [])
        .slice()
        .sort((a, b) => a.ordem - b.ordem)
        .map((u) => ({
          unit: u.unit,
          factorToCanonical: toNum(u.factorToCanonical),
          isCanonical: u.isCanonical,
          active: u.active,
        }));
      const zones = buildRanges(chaveFaixa(c.code));
      return {
        code: c.code,
        displayName: c.displayName,
        direction: resolveDirection(c.direction ?? null, dirByNorm.get(norm(c.displayName)) ?? null),
        canonicalUnit: c.canonicalUnit,
        synonyms: c.synonyms ?? [],
        units,
        zones,
        quantitativo: units.length > 0 || zones.length > 0,
        hasManualEdit: hasManual(chaveFaixa(c.code)),
        inCatalog: true,
        origin: (c.origin as "catalogo" | "descoberto" | null) ?? "catalogo",
        kind: c.kind ?? "blood",
        sexDependent: c.sexDependent ?? false,
      };
    });

    // Exames REAIS de laudos que ainda não estão no catálogo (a preencher).
    const consolid = new Map<string, { displayName: string; count: number }>();
    for (const r of reais) {
      if (!r.name) continue;
      if (known.has(chaveFaixa(r.name))) continue;
      const k = norm(r.name);
      const cur = consolid.get(k);
      if (cur) {
        cur.count += Number(r.n) || 0;
        if (r.name.length < cur.displayName.length) cur.displayName = r.name;
      } else {
        consolid.set(k, { displayName: r.name, count: Number(r.n) || 0 });
      }
    }
    for (const { displayName } of consolid.values()) {
      const code = displayName.toLowerCase();
      const zones = buildRanges(chaveFaixa(code));
      rows.push({
        code,
        displayName,
        direction: resolveDirection(null, dirByNorm.get(norm(displayName)) ?? null),
        canonicalUnit: null,
        synonyms: [],
        units: [],
        zones,
        quantitativo: zones.length > 0,
        hasManualEdit: hasManual(chaveFaixa(code)),
        inCatalog: false,
        origin: null,
        kind: "blood",
        sexDependent: false,
      });
    }

    rows.sort(
      (a, b) =>
        Number(b.inCatalog) - Number(a.inCatalog) ||
        a.displayName.localeCompare(b.displayName, "pt-BR"),
    );

    return res.json(rows);
  } catch (e) {
    req.log?.error({ err: e }, "GET /catalogo-faixas falhou");
    return res.status(500).json({ error: "Falha ao carregar planilha de exames" });
  }
});

const putCatalogoUnidadeSchema = z.object({
  code: z.string().min(1).max(160),
  canonicalUnit: z.string().min(1).max(40),
});

// PUT /catalogo-faixas — define a UNIDADE PADRÃO (dropdown) de um exame do
// catálogo: marca isCanonical na unidade escolhida (e desmarca as demais) +
// grava canonical_unit no catálogo. Não mexe em faixas/direção.
router.put("/exames-lab/catalogo-faixas", async (req: Request, res: Response) => {
  try {
    const parsed = putCatalogoUnidadeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    }
    const { code, canonicalUnit } = parsed.data;

    const units = await db
      .select()
      .from(examAnalyteUnitsTable)
      .where(eq(examAnalyteUnitsTable.analyteCode, code));
    if (units.length === 0) {
      return res.status(404).json({ error: "Exame sem unidades cadastradas" });
    }
    const alvo = units.find((u) => normUnit(u.unit) === normUnit(canonicalUnit));
    if (!alvo) {
      return res.status(400).json({ error: "Unidade não pertence a este exame" });
    }

    // Marca só a escolhida como canônica.
    for (const u of units) {
      const shouldBe = u.id === alvo.id;
      if (u.isCanonical !== shouldBe) {
        await db
          .update(examAnalyteUnitsTable)
          .set({ isCanonical: shouldBe })
          .where(eq(examAnalyteUnitsTable.id, u.id));
      }
    }
    await db
      .update(examAnalyteCatalogTable)
      .set({ canonicalUnit: alvo.unit })
      .where(eq(examAnalyteCatalogTable.code, code));

    return res.json({ ok: true, code, canonicalUnit: alvo.unit });
  } catch (e) {
    req.log?.error({ err: e }, "PUT /catalogo-faixas falhou");
    return res.status(500).json({ error: "Falha ao salvar unidade padrão" });
  }
});

// ===========================================================================
// APELIDOS (aliases) + UNIDADES por exame — curadoria universal.
// Vale para QUALQUER linha da planilha: se o exame ainda não existe no catálogo
// (é só um nome cru de laudo), a gravação PROMOVE o exame ao catálogo (INSERT)
// para o motor de varredura passar a reconhecê-lo. O motor (persist.ts) casa o
// nome do laudo contra displayName + synonyms — logo, salvar apelido já ensina
// o scanner, sem tocar o motor.
// ===========================================================================

// Resolve o code do catálogo para um exame (existente ou a promover) a partir do
// conjunto já carregado. Retorna o code canônico e a linha existente (se houver).
function resolverCodeCatalogo(
  all: { code: string; displayName: string; synonyms: string[] | null }[],
  code: string,
  displayName: string,
): { targetCode: string; existente: (typeof all)[number] | undefined } {
  const existentePorCode = all.find((c) => c.code === code);
  if (existentePorCode) return { targetCode: existentePorCode.code, existente: existentePorCode };
  const canon = chaveFaixa(displayName);
  const existentePorNome = all.find(
    (c) => c.code === canon || chaveFaixa(c.displayName) === canon,
  );
  if (existentePorNome) return { targetCode: existentePorNome.code, existente: existentePorNome };
  // Variante compacta: "CA 125" e "CA-125" apontam para o MESMO cadastro.
  const vNome = chaveVariante(displayName);
  if (vNome.length >= VARIANTE_MIN) {
    const existentePorVariante = all.find(
      (c) =>
        chaveVariante(c.code) === vNome ||
        chaveVariante(c.displayName) === vNome ||
        (c.synonyms ?? []).some((s) => chaveVariante(s) === vNome),
    );
    if (existentePorVariante)
      return { targetCode: existentePorVariante.code, existente: existentePorVariante };
  }
  return { targetCode: canon, existente: undefined };
}

const putAliasesSchema = z.object({
  code: z.string().min(1).max(200),
  displayName: z.string().min(1).max(200),
  synonyms: z.array(z.string().max(120)).max(12),
});

// PUT /catalogo-faixas/aliases — grava os apelidos CURADOS (até 12 visíveis) de um
// exame. Não destrutivo: apelidos internos além dos 12 (vindos da semente) são
// preservados. Unicidade: nenhum apelido pode colidir com o nome elegível ou
// apelido de OUTRO exame (400). Promove ao catálogo se o exame ainda não existe.
router.put("/exames-lab/catalogo-faixas/aliases", async (req: Request, res: Response) => {
  try {
    const parsed = putAliasesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    }
    const { code, displayName } = parsed.data;

    const all = await db
      .select({
        code: examAnalyteCatalogTable.code,
        displayName: examAnalyteCatalogTable.displayName,
        synonyms: examAnalyteCatalogTable.synonyms,
      })
      .from(examAnalyteCatalogTable);

    const { targetCode, existente } = resolverCodeCatalogo(all, code, displayName);

    // Chaves de identidade dos OUTROS exames (nome elegível + apelidos).
    // donoPorVariante: mesma proteção na forma COMPACTA ("ca125" = "ca 125").
    const donoPorChave = new Map<string, string>();
    const donoPorVariante = new Map<string, string>();
    const addVariante = (s: string, dono: string) => {
      const v = chaveVariante(s);
      if (v.length >= VARIANTE_MIN && !donoPorVariante.has(v)) donoPorVariante.set(v, dono);
    };
    for (const c of all) {
      if (c.code === targetCode) continue;
      donoPorChave.set(chaveFaixa(c.code), c.displayName);
      donoPorChave.set(chaveFaixa(c.displayName), c.displayName);
      addVariante(c.code, c.displayName);
      addVariante(c.displayName, c.displayName);
      for (const s of c.synonyms ?? []) {
        donoPorChave.set(chaveFaixa(s), c.displayName);
        addVariante(s, c.displayName);
      }
    }

    // Limpa entradas + normaliza; remove vazios e o que igualar o próprio nome.
    const chaveNome = chaveFaixa(displayName);
    const incoming: string[] = [];
    const vistos = new Set<string>();
    for (const raw of parsed.data.synonyms) {
      const s = raw.trim();
      if (!s) continue;
      const k = chaveFaixa(s);
      if (k === chaveNome) continue; // apelido == nome elegível: ignora (não é erro)
      if (vistos.has(k)) continue; // duplicado no próprio exame: dedup silencioso
      const v = chaveVariante(s);
      const dono =
        donoPorChave.get(k) ??
        (v.length >= VARIANTE_MIN ? donoPorVariante.get(v) : undefined);
      if (dono) {
        return res.status(400).json({
          error: `O apelido "${s}" já pertence ao exame "${dono}". Cada apelido só pode apontar para um exame.`,
          term: s,
          conflictsWith: dono,
        });
      }
      vistos.add(k);
      incoming.push(s);
    }

    // Não destrutivo: preserva apelidos internos além dos 12 primeiros.
    const internosOverflow = (existente?.synonyms ?? []).slice(12);
    const finalSyn: string[] = [];
    const finalKeys = new Set<string>();
    for (const s of [...incoming, ...internosOverflow]) {
      const k = chaveFaixa(s);
      if (k === chaveNome || finalKeys.has(k)) continue;
      finalKeys.add(k);
      finalSyn.push(s);
    }

    if (existente) {
      await db
        .update(examAnalyteCatalogTable)
        .set({ synonyms: finalSyn })
        .where(eq(examAnalyteCatalogTable.code, targetCode));
    } else {
      await db.insert(examAnalyteCatalogTable).values({
        code: targetCode,
        displayName,
        synonyms: finalSyn,
        active: true,
      });
    }

    return res.json({ ok: true, code: targetCode, synonyms: finalSyn, promoted: !existente });
  } catch (e) {
    req.log?.error({ err: e }, "PUT /catalogo-faixas/aliases falhou");
    return res.status(500).json({ error: "Falha ao salvar apelidos" });
  }
});

// PUT /catalogo/renomear — renomeia o NOME PADRAO (display_name) de um exame
// mantendo a IDENTIDADE (code) FIXA. Zero perda: o nome anterior vira apelido
// automatico e resultados/faixas/unidades (que apontam para o code) ficam intactos.
// Nao funde exames: colisao com nome/apelido/code de OUTRO exame -> 400 (use Englobar).
const putRenomearSchema = z.object({
  code: z.string().min(1).max(200),
  novoNome: z.string().min(1).max(200),
  // grafia atual mostrada na tela — usada so quando o exame ainda nao esta no
  // catalogo (linha de fallback vinda de resultados): entra como apelido para
  // preservar o casamento das grafias ja capturadas.
  nomeAtual: z.string().max(200).optional(),
});

router.put("/exames-lab/catalogo/renomear", async (req: Request, res: Response) => {
  try {
    const parsed = putRenomearSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    }
    const code = parsed.data.code.trim();
    const novoNome = parsed.data.novoNome.trim();
    if (!novoNome) {
      return res.status(400).json({ error: "O nome padrão não pode ficar vazio." });
    }

    const all = await db
      .select({
        code: examAnalyteCatalogTable.code,
        displayName: examAnalyteCatalogTable.displayName,
        synonyms: examAnalyteCatalogTable.synonyms,
      })
      .from(examAnalyteCatalogTable);

    const existente = all.find((c) => c.code === code);
    const chaveNovo = chaveFaixa(novoNome);
    const varNovo = chaveVariante(novoNome);

    // Unicidade: o novo nome nao pode colidir com code/nome/apelido de OUTRO
    // exame — nem na forma exata (chaveFaixa) nem na COMPACTA (chaveVariante:
    // "CA 125" x "CA-125" x "CA125" sao o mesmo exame).
    for (const c of all) {
      if (c.code === code) continue;
      const nomes = [c.code, c.displayName, ...(c.synonyms ?? [])];
      const chaves = new Set<string>(nomes.map((s) => chaveFaixa(s)));
      const colideVariante =
        varNovo.length >= VARIANTE_MIN &&
        nomes.some((s) => chaveVariante(s) === varNovo);
      if (chaves.has(chaveNovo) || colideVariante) {
        return res.status(400).json({
          error: `O nome "${novoNome}" já pertence ao exame "${c.displayName}". Para unir exames use a ferramenta Englobar.`,
          conflictsWith: c.displayName,
        });
      }
    }

    // Nome anterior: fonte de verdade = banco; fallback = nomeAtual do front.
    const nomeAnterior = (existente?.displayName ?? parsed.data.nomeAtual ?? "").trim();

    // Idempotente: renomear para o mesmo nome (ignorando acento/caixa) = no-op.
    if (existente && chaveFaixa(nomeAnterior) === chaveNovo) {
      return res.json({
        ok: true,
        code,
        displayName: existente.displayName,
        synonyms: existente.synonyms ?? [],
        unchanged: true,
      });
    }

    // Preserva os apelidos existentes + injeta o nome anterior (sem duplicar e
    // sem igualar o proprio nome novo).
    const finalSyn: string[] = [];
    const keys = new Set<string>();
    const push = (s: string) => {
      const t = s.trim();
      if (!t) return;
      const k = chaveFaixa(t);
      if (k === chaveNovo || keys.has(k)) return;
      keys.add(k);
      finalSyn.push(t);
    };
    for (const s of existente?.synonyms ?? []) push(s);
    if (nomeAnterior) push(nomeAnterior);

    if (existente) {
      await db
        .update(examAnalyteCatalogTable)
        .set({ displayName: novoNome, synonyms: finalSyn })
        .where(eq(examAnalyteCatalogTable.code, code));
    } else {
      await db.insert(examAnalyteCatalogTable).values({
        code,
        displayName: novoNome,
        synonyms: finalSyn,
        active: true,
        origin: "descoberto",
      });
    }

    return res.json({ ok: true, code, displayName: novoNome, synonyms: finalSyn });
  } catch (e) {
    req.log?.error({ err: e }, "PUT /catalogo/renomear falhou");
    return res.status(500).json({ error: "Falha ao renomear exame" });
  }
});

const putUnidadesSchema = z.object({
  code: z.string().min(1).max(200),
  displayName: z.string().min(1).max(200),
  units: z
    .array(
      z.object({
        unit: z.string().min(1).max(40),
        factorToCanonical: z.number().positive(),
        isCanonical: z.boolean(),
      }),
    )
    .min(1)
    .max(5),
});

// PUT /catalogo-faixas/unidades — define até 5 unidades comuns de um exame, com
// UMA marcada como padrão (canônica, fator 1) e as demais com fator de conversão.
// Substitui o conjunto de unidades daquele exame. Promove ao catálogo se preciso.
router.put("/exames-lab/catalogo-faixas/unidades", async (req: Request, res: Response) => {
  try {
    const parsed = putUnidadesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    }
    const { displayName, units } = parsed.data;

    // Dedup de unidade (por normUnit) dentro do payload.
    const vistas = new Set<string>();
    for (const u of units) {
      const k = normUnit(u.unit);
      if (vistas.has(k)) {
        return res.status(400).json({ error: `Unidade repetida no exame: "${u.unit}".` });
      }
      vistas.add(k);
    }

    // Exatamente uma canônica (se nenhuma marcada, a primeira vira padrão).
    const marcadas = units.filter((u) => u.isCanonical);
    if (marcadas.length > 1) {
      return res.status(400).json({ error: "Marque apenas UMA unidade como padrão." });
    }
    const canonicalUnit = (marcadas[0] ?? units[0]).unit;

    const all = await db
      .select({
        code: examAnalyteCatalogTable.code,
        displayName: examAnalyteCatalogTable.displayName,
        synonyms: examAnalyteCatalogTable.synonyms,
      })
      .from(examAnalyteCatalogTable);
    const { targetCode, existente } = resolverCodeCatalogo(all, parsed.data.code, displayName);

    // Garante a linha do catálogo (promoção).
    if (!existente) {
      await db.insert(examAnalyteCatalogTable).values({
        code: targetCode,
        displayName,
        synonyms: [],
        canonicalUnit,
        active: true,
      });
    }

    // Substitui o conjunto de unidades do exame.
    await db.delete(examAnalyteUnitsTable).where(eq(examAnalyteUnitsTable.analyteCode, targetCode));
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const ehCanon = normUnit(u.unit) === normUnit(canonicalUnit);
      await db.insert(examAnalyteUnitsTable).values({
        analyteCode: targetCode,
        unit: u.unit,
        factorToCanonical: String(ehCanon ? 1 : u.factorToCanonical),
        isCanonical: ehCanon,
        active: true,
        ordem: i + 1,
      });
    }
    await db
      .update(examAnalyteCatalogTable)
      .set({ canonicalUnit })
      .where(eq(examAnalyteCatalogTable.code, targetCode));

    return res.json({ ok: true, code: targetCode, canonicalUnit, promoted: !existente });
  } catch (e) {
    req.log?.error({ err: e }, "PUT /catalogo-faixas/unidades falhou");
    return res.status(500).json({ error: "Falha ao salvar unidades" });
  }
});

// ===========================================================================
// SALA DE TRIAGEM — faxina em massa + fila de conferencia humana
// ===========================================================================

// POST /exames-lab/triagem/backfill — roda a FAXINA A EXAUSTAO sobre toda grafia
// crua ainda sem code. Idempotente e sem perda. Devolve o resumo por destino.
router.post("/exames-lab/triagem/backfill", async (req: Request, res: Response) => {
  try {
    const opts = await readTriagemOptions();
    const summary = await runTriagemBackfill(opts);
    return res.json({ ok: true, ...summary });
  } catch (e) {
    req.log?.error({ err: e }, "POST /exames-lab/triagem/backfill falhou");
    return res.status(500).json({ error: "Falha ao rodar a faxina de triagem" });
  }
});

// GET /exames-lab/triagem — lista a fila pendente (ambiguo + nao_exame) e conta
// os cadastros DESCOBERTO ja criados automaticamente pela faxina.
router.get("/exames-lab/triagem", async (req: Request, res: Response) => {
  try {
    const fila = await db
      .select()
      .from(examAnalyteTriagemTable)
      .where(eq(examAnalyteTriagemTable.status, "pendente"))
      .orderBy(desc(examAnalyteTriagemTable.occurrences));

    // ACHADOS recentes: cadastros criados automaticamente pela faxina (origin=descoberto)
    const achados = await db
      .select({
        code: examAnalyteCatalogTable.code,
        displayName: examAnalyteCatalogTable.displayName,
      })
      .from(examAnalyteCatalogTable)
      .where(
        and(
          eq(examAnalyteCatalogTable.origin, "descoberto"),
          eq(examAnalyteCatalogTable.active, true),
          eq(examAnalyteCatalogTable.kind, "blood"),
        ),
      )
      .orderBy(desc(examAnalyteCatalogTable.id))
      .limit(50);

    // Contagens REAIS (a lista de achados acima e so uma amostra limitada a 50;
    // o contador do painel precisa do total verdadeiro).
    const [descRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(examAnalyteCatalogTable)
      .where(
        and(
          eq(examAnalyteCatalogTable.origin, "descoberto"),
          eq(examAnalyteCatalogTable.active, true),
          eq(examAnalyteCatalogTable.kind, "blood"),
        ),
      );
    // Ignorados da LIXEIRA = ignored_at preenchido (selo proprio da ferramenta).
    // active=false sozinho NAO serve: Englobar e fragments legados tambem usam.
    const [ignRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(examAnalyteCatalogTable)
      .where(isNotNull(examAnalyteCatalogTable.ignoredAt));

    // Nome de exibição do exame sugerido (para o rótulo do botão na fila).
    const sugCodes = Array.from(
      new Set(fila.map((r) => r.suggestedCode).filter((c): c is string => !!c)),
    );
    const nomePorCode = new Map<string, string>();
    if (sugCodes.length > 0) {
      const nomes = await db
        .select({
          code: examAnalyteCatalogTable.code,
          displayName: examAnalyteCatalogTable.displayName,
        })
        .from(examAnalyteCatalogTable)
        .where(inArray(examAnalyteCatalogTable.code, sugCodes));
      for (const n of nomes) nomePorCode.set(n.code, n.displayName);
    }

    return res.json({
      pendentes: fila.map((r) => ({
        id: r.id,
        sampleName: r.sampleName,
        occurrences: r.occurrences,
        kind: r.kind,
        suggestedCode: r.suggestedCode,
        suggestedName: r.suggestedCode ? nomePorCode.get(r.suggestedCode) ?? null : null,
        reason: r.reason,
      })),
      descobertos: achados,
      totais: {
        ambiguos: fila.filter((r) => r.kind === "ambiguo").length,
        naoExames: fila.filter((r) => r.kind === "nao_exame").length,
        descobertos: descRow?.n ?? 0,
        ignoradosCatalogo: ignRow?.n ?? 0,
      },
    });
  } catch (e) {
    req.log?.error({ err: e }, "GET /exames-lab/triagem falhou");
    return res.status(500).json({ error: "Falha ao listar a triagem" });
  }
});

// ===========================================================================
// LIXEIRA DE EXAMES — ignorar cadastros que NAO sao exames (artefatos, siglas
// de maquina/metodo, pedacos de laudo que a extracao achou que eram exame).
// Nada e apagado: active=false tira da lista e do motor; restaurar reverte.
// ===========================================================================

// GET /exames-lab/exames/ignorados — lista os cadastros ignorados (reversiveis)
router.get("/exames-lab/exames/ignorados", async (req: Request, res: Response) => {
  try {
    const linhas = await db
      .select({
        code: examAnalyteCatalogTable.code,
        displayName: examAnalyteCatalogTable.displayName,
        origin: examAnalyteCatalogTable.origin,
        synonyms: examAnalyteCatalogTable.synonyms,
        updatedAt: examAnalyteCatalogTable.updatedAt,
      })
      .from(examAnalyteCatalogTable)
      .where(isNotNull(examAnalyteCatalogTable.ignoredAt))
      .orderBy(desc(examAnalyteCatalogTable.updatedAt));
    return res.json(linhas);
  } catch (e) {
    req.log?.error({ err: e }, "GET /exames-lab/exames/ignorados falhou");
    return res.status(500).json({ error: "Falha ao listar os ignorados" });
  }
});

// POST /exames-lab/exames/:code/ignorar — marca o cadastro como NAO-exame.
router.post("/exames-lab/exames/:code/ignorar", async (req: Request, res: Response) => {
  try {
    const code = String(req.params.code);
    const [linha] = await db
      .select({ code: examAnalyteCatalogTable.code, active: examAnalyteCatalogTable.active })
      .from(examAnalyteCatalogTable)
      .where(eq(examAnalyteCatalogTable.code, code));
    if (!linha) return res.status(404).json({ error: "Exame não encontrado" });
    if (!linha.active) return res.json({ ok: true, code, jaIgnorado: true });
    // Selo proprio da lixeira: ignored_at + inativo. NAO mexe no kind, para a
    // restauracao devolver o estado exatamente como era.
    await db
      .update(examAnalyteCatalogTable)
      .set({ active: false, ignoredAt: new Date() })
      .where(eq(examAnalyteCatalogTable.code, code));
    return res.json({ ok: true, code });
  } catch (e) {
    req.log?.error({ err: e }, "POST /exames-lab/exames/:code/ignorar falhou");
    return res.status(500).json({ error: "Falha ao ignorar o exame" });
  }
});

// POST /exames-lab/exames/:code/restaurar — reverte um ignorar feito por engano.
router.post("/exames-lab/exames/:code/restaurar", async (req: Request, res: Response) => {
  try {
    const code = String(req.params.code);
    const [linha] = await db
      .select({
        code: examAnalyteCatalogTable.code,
        active: examAnalyteCatalogTable.active,
        ignoredAt: examAnalyteCatalogTable.ignoredAt,
      })
      .from(examAnalyteCatalogTable)
      .where(eq(examAnalyteCatalogTable.code, code));
    if (!linha) return res.status(404).json({ error: "Exame não encontrado" });
    if (linha.active) return res.json({ ok: true, code, jaAtivo: true });
    // So restaura quem foi ignorado pela lixeira. Inativos por OUTRO motivo
    // (ex.: absorvidos pelo Englobar) nao podem ressuscitar por aqui.
    if (!linha.ignoredAt) {
      return res.status(409).json({ error: "Este cadastro não está na lixeira de ignorados" });
    }
    // Reverte a lixeira: reativa e limpa o selo, SEM tocar no kind (o exame
    // volta exatamente como era antes de ser ignorado).
    await db
      .update(examAnalyteCatalogTable)
      .set({ active: true, ignoredAt: null })
      .where(eq(examAnalyteCatalogTable.code, code));
    return res.json({ ok: true, code });
  } catch (e) {
    req.log?.error({ err: e }, "POST /exames-lab/exames/:code/restaurar falhou");
    return res.status(500).json({ error: "Falha ao restaurar o exame" });
  }
});

const resolverTriagemSchema = z.object({
  // apelido -> funde no exame alvo (targetCode obrigatorio)
  // novo     -> cria cadastro DESCOBERTO a partir da grafia
  // ignorar  -> marca como nao-exame, sai da fila (nao entra no motor)
  acao: z.enum(["apelido", "novo", "ignorar"]),
  targetCode: z.string().optional(),
});

// POST /exames-lab/triagem/:id/resolver — decisao humana de UMA linha da fila.
router.post("/exames-lab/triagem/:id/resolver", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id inválido" });
    const parsed = resolverTriagemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    }
    const { acao, targetCode } = parsed.data;

    const rows = await db
      .select()
      .from(examAnalyteTriagemTable)
      .where(eq(examAnalyteTriagemTable.id, id))
      .limit(1);
    if (rows.length === 0) return res.status(404).json({ error: "Item não encontrado" });
    const item = rows[0];

    let carimbadas = 0;
    let code: string | null = null;

    if (acao === "apelido") {
      if (!targetCode) return res.status(400).json({ error: "targetCode é obrigatório para apelido" });
      const catalog = await loadCatalogFull();
      const ok = await absorbAsAlias(targetCode, item.sampleName, catalog);
      if (!ok) {
        return res.status(409).json({ error: "Essa grafia já pertence a outro exame; não fundi." });
      }
      code = targetCode;
      // carimba TODO o cluster (todas as grafias com o mesmo normKey), nao so a amostra
      const stamp = await setResultCodeForNormKey(item.normKey, targetCode);
      for (const v of stamp.variants) await absorbAsAlias(targetCode, v, catalog);
      carimbadas = stamp.carimbadas;
    } else if (acao === "novo") {
      const catalog = await loadCatalogFull();
      code = await createDiscoveredExam(item.sampleName, catalog, [item.sampleName]);
      const stamp = await setResultCodeForNormKey(item.normKey, code);
      for (const v of stamp.variants) await absorbAsAlias(code, v, catalog);
      carimbadas = stamp.carimbadas;
    }
    // "ignorar" apenas resolve a linha (fica fora do motor).

    await db
      .update(examAnalyteTriagemTable)
      .set({
        status: "resolvido",
        resolution: acao === "apelido" ? "apelido" : acao === "novo" ? "novo" : "ignorado",
        updatedAt: new Date(),
      })
      .where(eq(examAnalyteTriagemTable.id, id));

    return res.json({ ok: true, code, carimbadas });
  } catch (e) {
    req.log?.error({ err: e }, "POST /exames-lab/triagem/:id/resolver falhou");
    return res.status(500).json({ error: "Falha ao resolver o item da triagem" });
  }
});

// POST /exames-lab/triagem/curadoria — faxina determinística em massa da fila
// (Caminho A) + unidade canônica e direção favorável (Caminho B). Idempotente.
router.post("/exames-lab/triagem/curadoria", async (req: Request, res: Response) => {
  try {
    const resumo = await runCuradoriaTriagem();
    return res.json({ ok: true, resumo });
  } catch (e) {
    req.log?.error({ err: e }, "POST /exames-lab/triagem/curadoria falhou");
    return res.status(500).json({ error: "Falha ao rodar a curadoria da triagem" });
  }
});

// ===== Demanda 2: procedência da grafia + abrir/baixar o laudo original =====

function driveUrlFrom(id: string | null): string | null {
  return id ? `https://drive.google.com/file/d/${id}/view` : null;
}

interface ProcedenciaItem {
  examDocumentId: number;
  clientId: number;
  clientName: string;
  fileName: string;
  sourcePdfDriveId: string | null;
  sourcePath: string | null;
  valueRaw: string | null;
  unitRaw: string | null;
  grafiaCrua: string | null;
  collectionDate: string | null;
  createdAt: Date;
  driveUrl: string | null;
}

// Monta a lista de arquivos de origem, agrupada por documento (um arquivo = uma linha).
// - filtro "code": linhas cujo analyteCode == valor (exame do catálogo).
// - filtro "normKey": linhas cruas (sem code) cujo analyteNameRaw normaliza para o normKey
//   do cluster de triagem (mesmo casamento usado em setResultCodeForNormKey).
async function montarProcedencia(
  filtro: "code" | "normKey",
  valor: string,
): Promise<ProcedenciaItem[]> {
  if (!valor) return [];
  const rows = await db
    .select({
      examDocumentId: examResultsTable.examDocumentId,
      clientId: examResultsTable.clientId,
      clientName: clientsTable.name,
      analyteNameRaw: examResultsTable.analyteNameRaw,
      valueRaw: examResultsTable.valueRaw,
      unitRaw: examResultsTable.unitRaw,
      fileName: examDocumentsTable.fileName,
      sourcePdfDriveId: examDocumentsTable.sourcePdfDriveId,
      sourcePath: examDocumentsTable.sourcePath,
      collectionDate: examDocumentsTable.collectionDate,
      createdAt: examDocumentsTable.createdAt,
    })
    .from(examResultsTable)
    .innerJoin(examDocumentsTable, eq(examResultsTable.examDocumentId, examDocumentsTable.id))
    .innerJoin(clientsTable, eq(examResultsTable.clientId, clientsTable.id))
    .where(
      filtro === "code"
        ? eq(examResultsTable.analyteCode, valor)
        : isNull(examResultsTable.analyteCode),
    );

  const filtradas =
    filtro === "code"
      ? rows
      : rows.filter(
          (r) => !!r.analyteNameRaw && normalizeAnalyteName(r.analyteNameRaw) === valor,
        );

  const porDoc = new Map<number, ProcedenciaItem>();
  for (const r of filtradas) {
    if (porDoc.has(r.examDocumentId)) continue;
    porDoc.set(r.examDocumentId, {
      examDocumentId: r.examDocumentId,
      clientId: r.clientId,
      clientName: r.clientName,
      fileName: r.fileName,
      sourcePdfDriveId: r.sourcePdfDriveId,
      sourcePath: r.sourcePath,
      valueRaw: r.valueRaw,
      unitRaw: r.unitRaw,
      grafiaCrua: r.analyteNameRaw,
      collectionDate: r.collectionDate,
      createdAt: r.createdAt,
      driveUrl: driveUrlFrom(r.sourcePdfDriveId),
    });
  }
  return Array.from(porDoc.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

// GET procedência de um item pendente da triagem (por normKey do cluster).
router.get("/exames-lab/triagem/:id/procedencia", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id inválido" });
    const rows = await db
      .select({ normKey: examAnalyteTriagemTable.normKey })
      .from(examAnalyteTriagemTable)
      .where(eq(examAnalyteTriagemTable.id, id))
      .limit(1);
    if (rows.length === 0) return res.status(404).json({ error: "Item não encontrado" });
    const itens = await montarProcedencia("normKey", rows[0].normKey);
    return res.json({ itens });
  } catch (e) {
    req.log?.error({ err: e }, "GET /exames-lab/triagem/:id/procedencia falhou");
    return res.status(500).json({ error: "Falha ao carregar a procedência" });
  }
});

// GET procedência de um exame do catálogo (por code).
router.get("/exames-lab/catalogo/:code/procedencia", async (req: Request, res: Response) => {
  try {
    const code = String(req.params.code ?? "").trim();
    if (!code) return res.status(400).json({ error: "code inválido" });
    const itens = await montarProcedencia("code", code);
    return res.json({ itens });
  } catch (e) {
    req.log?.error({ err: e }, "GET /exames-lab/catalogo/:code/procedencia falhou");
    return res.status(500).json({ error: "Falha ao carregar a procedência" });
  }
});

// GET baixa/abre o arquivo original do laudo pelo próprio sistema (robusto: não
// depende do usuário estar logado na conta Google). inline=1 abre no navegador.
router.get("/exames-lab/documento/:docId/arquivo", async (req: Request, res: Response) => {
  try {
    const docId = Number(req.params.docId);
    if (!Number.isFinite(docId)) return res.status(400).json({ error: "docId inválido" });
    const docs = await db
      .select({
        fileName: examDocumentsTable.fileName,
        driveId: examDocumentsTable.sourcePdfDriveId,
      })
      .from(examDocumentsTable)
      .where(eq(examDocumentsTable.id, docId))
      .limit(1);
    if (docs.length === 0) return res.status(404).json({ error: "Documento não encontrado" });
    const doc = docs[0];
    if (!doc.driveId) {
      return res.status(404).json({ error: "Este documento não tem arquivo no Drive." });
    }
    const buf = await driveDownloadFile(doc.driveId);
    const fname = (doc.fileName || `documento-${docId}.pdf`).replace(/[\r\n"]/g, "");
    const ext = fname.split(".").pop()?.toLowerCase() ?? "";
    const contentType =
      ext === "pdf"
        ? "application/pdf"
        : ext === "png"
          ? "image/png"
          : ext === "jpg" || ext === "jpeg"
            ? "image/jpeg"
            : "application/octet-stream";
    const disp = req.query.inline === "1" ? "inline" : "attachment";
    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `${disp}; filename*=UTF-8''${encodeURIComponent(fname)}`,
    );
    return res.send(buf);
  } catch (e) {
    req.log?.error({ err: e }, "GET /exames-lab/documento/:docId/arquivo falhou");
    return res.status(500).json({ error: "Falha ao baixar o arquivo" });
  }
});

// ============================================================================
// Re-extração manual de um documento (POST /exames-lab/documento/:docId/reextrair)
// Baixa o PDF do Drive → Gemini vision multimodal → apaga resultados antigos → persiste.
// ============================================================================
router.post("/exames-lab/documento/:docId/reextrair", async (req: Request, res: Response) => {
  try {
    const docId = Number(req.params.docId);
    if (!Number.isFinite(docId)) return res.status(400).json({ error: "docId inválido" });

    const docs = await db
      .select({
        id: examDocumentsTable.id,
        clientId: examDocumentsTable.clientId,
        driveId: examDocumentsTable.sourcePdfDriveId,
        fileName: examDocumentsTable.fileName,
      })
      .from(examDocumentsTable)
      .where(eq(examDocumentsTable.id, docId))
      .limit(1);

    if (docs.length === 0) return res.status(404).json({ error: "Documento não encontrado" });
    const doc = docs[0];
    if (!doc.driveId) return res.status(422).json({ error: "Documento sem arquivo no Drive — re-extração impossível" });

    // Baixar o arquivo do Drive
    const buffer = await driveDownloadFile(doc.driveId);

    // Gemini vision multimodal: lê pixels, não texto — funciona em PDFs escaneados
    const result = await extractExamFromMedia(buffer, "application/pdf");

    // Apagar resultados antigos deste documento
    await db.delete(examResultsTable).where(eq(examResultsTable.examDocumentId, docId));

    // Atualizar metadados do documento (lab, data de coleta, modelo usado)
    await finalizeDocument(docId, result.data, result.modelUsed);

    // Persistir novos analitos
    const summary = await persistExtractedResults({
      documentId: docId,
      clientId: doc.clientId,
      extracted: result.data,
    });

    req.log?.info(
      { docId, analytes: result.data.analytes.length, model: result.modelUsed },
      "Re-extração concluída",
    );

    return res.json({
      ok: true,
      analytes: result.data.analytes.length,
      modelUsed: result.modelUsed,
      escalated: result.escalated,
      confidence: result.data.confidence,
      labName: result.data.labName,
      collectionDate: result.data.collectionDate,
      summary,
    });
  } catch (e) {
    req.log?.error({ err: e }, "POST /exames-lab/documento/:docId/reextrair falhou");
    return res.status(500).json({ error: "Falha na re-extração" });
  }
});

// ============================================================================
// Ferramentas de curadoria: ENGLOBAR + TRANSFERIR + DESFAZER (motor em reassign.ts).
// Spec: specs/exame-englobar-transferir.md.
// ============================================================================

function handleReassignError(res: Response, e: unknown, log: Request["log"], ctx: string) {
  if (e instanceof ReassignError) {
    return res.status(e.status).json({ error: e.message });
  }
  log?.error({ err: e }, ctx);
  return res.status(500).json({ error: "Falha na operação de curadoria" });
}

// Prévia de impacto de um exame (nº de resultados/clientes/documentos + origem).
router.get("/exames-lab/exames/:code/impacto", async (req: Request, res: Response) => {
  try {
    const code = String(req.params.code ?? "").trim();
    if (!code) return res.status(400).json({ error: "code inválido" });
    return res.json(await impactoExame(code));
  } catch (e) {
    return handleReassignError(res, e, req.log, "GET /exames-lab/exames/:code/impacto falhou");
  }
});

const englobarSchema = z.object({
  sourceCode: z.string().min(1),
  targetCode: z.string().min(1),
  confirmOficial: z.boolean().optional(),
});

// ENGLOBAR um exame cadastrado (source) dentro de um exame padrão (target).
router.post("/exames-lab/exames/englobar", async (req: Request, res: Response) => {
  try {
    const parsed = englobarSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Corpo inválido" });
    const { sourceCode, targetCode, confirmOficial } = parsed.data;
    const out = await englobarExame(sourceCode, targetCode, confirmOficial ?? false);
    return res.json(out);
  } catch (e) {
    return handleReassignError(res, e, req.log, "POST /exames-lab/exames/englobar falhou");
  }
});

const transferirSchema = z.object({
  targetCode: z.string().min(1),
  resultIds: z.array(z.number().int()).optional(),
  sourceCode: z.string().optional(),
  examDocumentId: z.number().int().optional(),
  clientId: z.number().int().optional(),
});

// TRANSFERIR resultado(s) de um exame para outro (nível resultado).
router.post("/exames-lab/exames/transferir", async (req: Request, res: Response) => {
  try {
    const parsed = transferirSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Corpo inválido" });
    const out = await transferirResultados(parsed.data);
    return res.json(out);
  } catch (e) {
    return handleReassignError(res, e, req.log, "POST /exames-lab/exames/transferir falhou");
  }
});

// Lista os últimos lotes de curadoria (para o painel DESFAZER).
router.get("/exames-lab/reassignments", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    return res.json({ lotes: await listarLotes(limit) });
  } catch (e) {
    return handleReassignError(res, e, req.log, "GET /exames-lab/reassignments falhou");
  }
});

// DESFAZER um lote de curadoria (restaura estado anterior fielmente; idempotente).
router.post(
  "/exames-lab/reassignments/:batchId/desfazer",
  async (req: Request, res: Response) => {
    try {
      const batchId = String(req.params.batchId ?? "").trim();
      if (!batchId) return res.status(400).json({ error: "batchId inválido" });
      return res.json(await desfazerLote(batchId));
    } catch (e) {
      return handleReassignError(
        res,
        e,
        req.log,
        "POST /exames-lab/reassignments/:batchId/desfazer falhou",
      );
    }
  },
);

// ─── Clone retroativo no Drive do paciente ───────────────────────────────────
// Cria a cópia canônica na pasta EXAMES do paciente para documentos que
// foram processados antes do fix de destino de pasta (copiedDriveId = null).
router.post("/exames-lab/documento/:docId/clonar-drive", async (req: Request, res: Response) => {
  try {
    const docId = Number(req.params.docId);
    if (!docId) return res.status(400).json({ error: "docId inválido" });

    // 1. Buscar o exam_document
    const [doc] = await db
      .select()
      .from(examDocumentsTable)
      .where(eq(examDocumentsTable.id, docId))
      .limit(1);
    if (!doc) return res.status(404).json({ error: "Documento não encontrado" });
    if (!doc.sourcePdfDriveId) return res.status(422).json({ error: "Documento sem sourcePdfDriveId — não é possível clonar" });

    // 2. Buscar o registro do watcher (para renamedTo e folderType)
    const watcherRows = await db.execute(
      sql`SELECT file_id, folder_type, renamed_to, copied_drive_id
          FROM drive_watcher_files
          WHERE exam_document_id = ${docId}
          LIMIT 1`
    );
    const watcher = (watcherRows.rows ?? [])[0] as {
      file_id: string; folder_type: string;
      renamed_to: string | null; copied_drive_id: string | null;
    } | undefined;

    if (watcher?.copied_drive_id) {
      return res.status(409).json({
        error: "Clone já existe",
        copiedDriveId: watcher.copied_drive_id,
        driveUrl: `https://drive.google.com/file/d/${watcher.copied_drive_id}/view`,
      });
    }

    const renamedTo = watcher?.renamed_to ?? doc.fileName;
    const folderType = watcher?.folder_type ?? "sangue";

    // 3. Resolver pasta pessoal do paciente
    const [clientRow] = await db
      .select({ name: clientsTable.name, cpf: clientsTable.cpf })
      .from(clientsTable)
      .where(eq(clientsTable.id, doc.clientId))
      .limit(1);
    if (!clientRow) return res.status(422).json({ error: "Cliente não encontrado" });

    const structure = await ensureClientFolderStructure(clientRow.name, clientRow.cpf ?? "");
    const subs = structure.subfolders;
    const examesFolderId = folderType === "sangue" ? subs["EXAMES"] : subs["IMAGENS"];
    if (!examesFolderId) {
      return res.status(422).json({ error: "Subpasta EXAMES/IMAGENS não encontrada na estrutura do cliente" });
    }

    // 4. Copiar no Drive
    const { fileId: copiedDriveId } = await driveCopyFileInFolder(
      doc.sourcePdfDriveId,
      examesFolderId,
      renamedTo,
    );

    // 5. Gravar o copiedDriveId no drive_watcher_files (PK = file_id)
    if (watcher) {
      await db.execute(sql`
        UPDATE drive_watcher_files
        SET copied_drive_id = ${copiedDriveId},
            copied_name     = ${renamedTo}
        WHERE file_id = ${watcher.file_id}
      `);
    }

    req.log.info({ docId, copiedDriveId, examesFolderId }, "Clone retroativo criado no Drive");

    return res.json({
      ok: true,
      copiedDriveId,
      copiedName: renamedTo,
      driveUrl: `https://drive.google.com/file/d/${copiedDriveId}/view`,
    });
  } catch (e) {
    req.log.error({ err: e }, "POST /exames-lab/documento/:docId/clonar-drive falhou");
    return res.status(500).json({ error: String(e) });
  }
});

// ─── SIMULAÇÃO: conversão de unidade ─────────────────────────────────────────
// Cria um documento e analito fictícios com conversão de unidade explícita.
// Hemoglobina: laudo em g/L (150) → sistema converte para g/dL (15).
// Confirma visualmente que o motor ↔ age sobre a diferença de unidade.
// Idempotente: roda duas vezes sem duplicar.
router.post("/exames-lab/demo-conversao", async (req: Request, res: Response) => {
  try {
    const clientId = Number(req.query.clientId ?? 3747);
    const DEMO_HASH = "demo-conversao-hemoglobina-v1";

    // 1. Documento fictício (idempotente por hash)
    const existing = await db
      .select({ id: examDocumentsTable.id })
      .from(examDocumentsTable)
      .where(eq(examDocumentsTable.hash, DEMO_HASH))
      .limit(1);

    let docId: number;
    if (existing.length > 0) {
      docId = existing[0].id;
    } else {
      const [newDoc] = await db
        .insert(examDocumentsTable)
        .values({
          clientId,
          empresaId: 5,
          hash: DEMO_HASH,
          fileName: "DEMO — Conversão de Unidade g_L para g_dL.pdf",
          labName: "Laboratório Demonstração PAXTER",
          collectionDate: "2026-07-23",
          examKind: "lab",
          origin: "demo",
          status: "recebido",
          confidence: "1",
          modelUsed: "demo-deterministico",
        })
        .returning({ id: examDocumentsTable.id });
      docId = newDoc.id;
    }

    // 2. Analitos de demonstração (limpa antes para ser idempotente)
    await db.execute(
      sql`DELETE FROM exam_results WHERE exam_document_id = ${docId}`
    );

    // 3 analitos de demonstração mostrando 3 cenários possíveis
    await db.execute(sql`
      INSERT INTO exam_results
        (exam_document_id, client_id, analyte_name_raw, analyte_code,
         value_raw, unit_raw, value_canonical, unit_canonical, unit_converted,
         ref_low, ref_high, status, collection_date, is_history)
      VALUES
        -- Cenário A: lab reportou g/L, sistema converteu para g/dL (motor agiu)
        (${docId}, ${clientId}, 'Hemoglobina', 'HEMOGLOBINA',
         '150', 'g/L', '15.0', 'g/dL', TRUE,
         '13', '17', 'dentro', '2026-07-23', FALSE),
        -- Cenário B: lab reportou g/dL, mesma unidade canônica (sem conversão)
        (${docId}, ${clientId}, 'Hemoglobina Glicada HbA1c', 'HEMOGLOBINA-GLICADA-HBA1C',
         '5.2', '%', '5.2', '%', FALSE,
         '4', '5.6', 'normal', '2026-07-23', FALSE),
        -- Cenário C: unidade desconhecida (sem catálogo = sem conversão, sinaliza revisão)
        (${docId}, ${clientId}, 'Ferritina', 'FERRITINA',
         '85', 'ng/mL', NULL, NULL, FALSE,
         '12', '150', 'normal', '2026-07-23', FALSE)
    `);

    return res.json({
      ok: true,
      docId,
      clientId,
      message: "Demo criado. Abra a Procedência de Exames e selecione o cliente para ver a conversão.",
      cenarios: [
        { analito: "Hemoglobina", unitRaw: "g/L", unitCanonical: "g/dL", valueRaw: "150", valueCanonical: "15.0", convertido: true },
        { analito: "HbA1c", unitRaw: "%", unitCanonical: "%", valueRaw: "5.2", valueCanonical: "5.2", convertido: false },
        { analito: "Ferritina", unitRaw: "ng/mL", unitCanonical: null, convertido: false, obs: "unidade sem catálogo" },
      ],
    });
  } catch (e) {
    req.log.error({ err: e }, "POST /exames-lab/demo-conversao falhou");
    return res.status(500).json({ error: String(e) });
  }
});

// ---- GET /exames-lab/monitor — status global do motor ----
router.get("/exames-lab/monitor", async (req: Request, res: Response) => {
  try {
    const stats = await db.execute(sql`
      SELECT status, COUNT(*)::int AS total
      FROM exam_documents
      GROUP BY status
      ORDER BY status
    `);
    const pendentes = await db.execute(sql`
      SELECT d.id, d.client_id, d.status, d.file_name, d.created_at, d.source_pdf_drive_id,
             c.name AS client_name
      FROM exam_documents d
      LEFT JOIN clients c ON d.client_id = c.id
      WHERE d.status IN ('erro', 'processando')
      ORDER BY d.created_at DESC
      LIMIT 60
    `);
    return res.json({ stats: stats.rows, pendentes: pendentes.rows });
  } catch (e) {
    req.log.error({ err: e }, "GET /exames-lab/monitor falhou");
    return res.status(500).json({ error: "Falha ao carregar monitor" });
  }
});

// ---- POST /exames-lab/recovery — acionar recovery manual ----
router.post("/exames-lab/recovery", async (req: Request, res: Response) => {
  try {
    setImmediate(() => {
      recoverStuckDocuments().catch((e) =>
        logger.error({ err: e }, "recovery manual falhou")
      );
    });
    return res.json({ ok: true, message: "Recovery iniciado em background" });
  } catch (e) {
    req.log.error({ err: e }, "POST /exames-lab/recovery falhou");
    return res.status(500).json({ error: "Falha ao iniciar recovery" });
  }
});

// ============================================================================
// Onda B — Cofre interno + links do Drive
// ============================================================================

// GET /exames-lab/documento/:id/download — serve a CÓPIA INTERNA (cofre do sistema)
router.get("/exames-lab/documento/:id/download", requireCollaborator, async (req: Request, res: Response) => {
  try {
    const docId = Number(req.params.id);
    if (!Number.isFinite(docId)) return res.status(400).json({ error: "id inválido" });
    const copy = await getInternalCopy(docId);
    if (!copy) {
      return res.status(404).json({ error: "Este documento não tem cópia interna no cofre do sistema." });
    }
    const fname = copy.fileName.replace(/[\r\n"]/g, "");
    const disp = req.query.inline === "1" ? "inline" : "attachment";
    res.setHeader("Content-Type", copy.mimeType);
    res.setHeader("Content-Disposition", `${disp}; filename*=UTF-8''${encodeURIComponent(fname)}`);
    return res.send(copy.bytes);
  } catch (e) {
    req.log?.error({ err: e }, "GET /exames-lab/documento/:id/download falhou");
    return res.status(500).json({ error: "Falha ao baixar a cópia interna" });
  }
});

// GET /exames-lab/documento/:id/links — links do Drive + disponibilidade interna
router.get("/exames-lab/documento/:id/links", requireCollaborator, async (req: Request, res: Response) => {
  try {
    const docId = Number(req.params.id);
    if (!Number.isFinite(docId)) return res.status(400).json({ error: "id inválido" });
    const docs = await db
      .select({
        sourcePdfDriveId: examDocumentsTable.sourcePdfDriveId,
        fileName: examDocumentsTable.fileName,
      })
      .from(examDocumentsTable)
      .where(eq(examDocumentsTable.id, docId))
      .limit(1);
    if (docs.length === 0) return res.status(404).json({ error: "Documento não encontrado" });

    // Cópia renomeada feita pelo watcher (se veio da pasta vigiada)
    const watcherRows = await db.execute(sql`
      SELECT copied_drive_id FROM drive_watcher_files
      WHERE exam_document_id = ${docId} AND copied_drive_id IS NOT NULL
      LIMIT 1
    `);
    const wArr = (watcherRows as unknown as { rows: { copied_drive_id: string }[] }).rows ?? [];
    const copiedId = wArr[0]?.copied_drive_id ?? null;
    const srcId = docs[0].sourcePdfDriveId;
    const toUrl = (id: string | null) => (id ? `https://drive.google.com/file/d/${id}/view` : null);

    return res.json({
      fileName: docs[0].fileName,
      driveUrl: toUrl(copiedId ?? srcId),
      sourceDriveUrl: toUrl(srcId),
      copiedDriveUrl: toUrl(copiedId),
      hasInternal: await hasInternalCopy(docId),
    });
  } catch (e) {
    req.log?.error({ err: e }, "GET /exames-lab/documento/:id/links falhou");
    return res.status(500).json({ error: "Falha ao montar links" });
  }
});

// ============================================================================
// Onda C — Auditoria em tempo real (linha do tempo por documento)
// ============================================================================
router.get("/exames-lab/auditoria", requireCollaborator, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const rows = await db.execute(sql`
      SELECT d.id, d.file_name, d.origin, d.status, d.exam_kind,
             d.created_at, w.processed_at, d.source_pdf_drive_id,
             c.name AS client_name,
             CASE WHEN w.processed_at IS NOT NULL
                  THEN GREATEST(EXTRACT(EPOCH FROM (w.processed_at - d.created_at))::int, 0)
                  ELSE NULL END AS elapsed_s,
             (SELECT COUNT(*)::int FROM exam_results r WHERE r.exam_document_id = d.id) AS analitos
      FROM exam_documents d
      LEFT JOIN clients c ON c.id = d.client_id
      LEFT JOIN LATERAL (
        SELECT processed_at FROM drive_watcher_files
        WHERE exam_document_id = d.id AND processed_at IS NOT NULL
        ORDER BY processed_at DESC LIMIT 1
      ) w ON TRUE
      ORDER BY d.created_at DESC
      LIMIT ${limit}
    `);
    // Adiciona colunas de auditoria multi-IA (adicionadas via ALTER TABLE)
    const rows2 = await db.execute(sql`
      SELECT id, reprocessamento_count, reprocessado_at, llm_pipeline
      FROM exam_documents
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    // Mescla colunas extras por id
    const extraMap = new Map<number, Record<string, unknown>>();
    for (const r of (rows2 as unknown as { rows: Record<string, unknown>[] }).rows) {
      extraMap.set(Number(r.id), r);
    }
    const eventos = (rows as unknown as { rows: Record<string, unknown>[] }).rows.map((row) => ({
      ...row,
      ...(extraMap.get(Number(row.id)) ?? {}),
    }));
    return res.json({ eventos });
  } catch (e) {
    req.log?.error({ err: e }, "GET /exames-lab/auditoria falhou");
    return res.status(500).json({ error: "Falha ao carregar auditoria" });
  }
});

// ─── Reprocessamento individual por ID ────────────────────────────────────────
// POST /api/exames-lab/reprocessar/:id
// Reinicia o pipeline de extração de IA para 1 documento específico.
// Busca o buffer do cofre interno (preferência) ou do Google Drive.
// Incrementa reprocessamento_count e grava reprocessado_at = NOW().
router.post("/exames-lab/reprocessar/:id", requireCollaborator, async (req: Request, res: Response) => {
  const docId = Number(req.params.id);
  if (!docId || Number.isNaN(docId)) {
    return res.status(400).json({ error: "ID inválido" });
  }
  try {
    const docs = await db
      .select()
      .from(examDocumentsTable)
      .where(eq(examDocumentsTable.id, docId))
      .limit(1);
    if (!docs.length) return res.status(404).json({ error: "Documento não encontrado" });
    const doc = docs[0];

    // Tenta obter o arquivo: cofre interno → Drive
    let buffer: Buffer | null = null;
    const copy = await getInternalCopy(docId);
    if (copy) {
      buffer = copy.buffer;
    } else if (doc.sourcePdfDriveId) {
      try {
        buffer = await driveDownloadFile(doc.sourcePdfDriveId);
      } catch (driveErr: any) {
        logger.warn({ driveErr: driveErr.message, docId }, "reprocessar: falha ao baixar do Drive");
      }
    }

    if (!buffer) {
      return res.status(422).json({
        error: "Arquivo original não encontrado no cofre interno nem no Drive. Reprocessamento impossível.",
      });
    }

    // Incrementa contador e muda status para processando (raw SQL — colunas via ALTER TABLE)
    await db.execute(sql`
      UPDATE exam_documents
      SET status = 'processando',
          reprocessamento_count = COALESCE(reprocessamento_count, 0) + 1,
          reprocessado_at = NOW()
      WHERE id = ${docId}
    `);

    // Fire-and-forget: reprocessa em background
    void processExamDocument({
      documentId: docId,
      clientId: doc.clientId,
      buffer,
      fileName: doc.fileName ?? "documento.pdf",
    }).catch((err: Error) => {
      logger.error({ err: err.message, docId }, "Falha no reprocessamento manual");
    });

    return res.json({ ok: true, message: "Reprocessamento iniciado em background" });
  } catch (e: any) {
    req.log?.error({ err: e }, "POST /exames-lab/reprocessar/:id falhou");
    return res.status(500).json({ error: "Erro interno ao iniciar reprocessamento" });
  }
});

// ─── Status público de documento (usado pelo portal do cliente) ───────────────
// GET /api/exames-lab/doc-status/:documentId — sem auth, retorna apenas status
router.get("/exames-lab/doc-status/:documentId", async (req: Request, res: Response) => {
  const docId = Number(req.params.documentId);
  if (!docId || Number.isNaN(docId)) return res.status(400).json({ error: "ID inválido" });
  try {
    const rows = await db.execute(sql`
      SELECT d.id, d.status,
             (SELECT COUNT(*)::int FROM exam_results r WHERE r.exam_document_id = d.id) AS analitos
      FROM exam_documents d
      WHERE d.id = ${docId}
      LIMIT 1
    `);
    const row = (rows as unknown as { rows: unknown[] }).rows[0];
    if (!row) return res.status(404).json({ error: "Não encontrado" });
    return res.json(row);
  } catch {
    return res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
