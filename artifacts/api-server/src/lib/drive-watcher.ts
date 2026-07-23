import { createHash } from "node:crypto";
import { db, clientsTable, examDocumentsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  driveListChildren,
  driveDownloadFile,
  uploadFileToDrive,
  ensureClientFolderStructure,
} from "./google-drive.js";
import { extractPdfText } from "./exam-extraction/pdf-text.js";
import { extractExamFromText } from "./exam-extraction/extract.js";
import {
  persistExtractedResults,
  finalizeDocument,
  markDocumentError,
} from "./exam-extraction/persist.js";
import { normalizeName, loadClients, resolveClient } from "./drive-import/matcher.js";
import { logger } from "./logger.js";

// ============================================================================
// Motor de Vigilância de Pasta Drive
// Assiste duas pastas compartilhadas ("EXAMES PACIENTES SANGUE" e "EXAMES
// PACIENTES IMAGEM") e importa automaticamente qualquer arquivo novo.
// Fluxo: listar → casar paciente → baixar → extrair → renomear → upload Drive
// ============================================================================

export const WATCHED_FOLDERS = [
  {
    id: "1Nytg2IccYs5Bw6p1U8tF1X9K-MgTzRdW",
    type: "sangue" as const,
    label: "Exames de Sangue",
    driveSubfolder: "EXAMES",
  },
  {
    id: "1Z2Z-NVbC8txbdNgn4R-AaTNS7Vhnf89F",
    type: "imagem" as const,
    label: "Exames de Imagem",
    driveSubfolder: "IMAGENS",
  },
];

// ─── DB helpers (tabela raw criada no boot) ───────────────────────────────────

async function ensureTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS drive_watcher_files (
      file_id TEXT PRIMARY KEY,
      folder_id TEXT NOT NULL,
      folder_type TEXT NOT NULL,
      original_name TEXT NOT NULL,
      renamed_to TEXT,
      client_id INTEGER,
      client_name_raw TEXT,
      status TEXT NOT NULL DEFAULT 'pendente',
      error_msg TEXT,
      exam_document_id INTEGER,
      processed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getKnownFileIds(): Promise<Set<string>> {
  await ensureTable();
  const rows = await db.execute(sql`SELECT file_id FROM drive_watcher_files`);
  const arr: { file_id: string }[] =
    (rows as unknown as { rows: { file_id: string }[] }).rows ??
    (Array.isArray(rows) ? rows : []);
  return new Set(arr.map((r) => r.file_id));
}

async function upsertFile(params: {
  fileId: string;
  folderId: string;
  folderType: string;
  originalName: string;
  clientId?: number;
  clientNameRaw?: string;
  status?: string;
  errorMsg?: string;
  renamedTo?: string;
  examDocumentId?: number;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO drive_watcher_files
      (file_id, folder_id, folder_type, original_name, client_id, client_name_raw, status, error_msg, renamed_to, exam_document_id)
    VALUES
      (${params.fileId}, ${params.folderId}, ${params.folderType}, ${params.originalName},
       ${params.clientId ?? null}, ${params.clientNameRaw ?? null},
       ${params.status ?? "pendente"}, ${params.errorMsg ?? null},
       ${params.renamedTo ?? null}, ${params.examDocumentId ?? null})
    ON CONFLICT (file_id) DO UPDATE SET
      status         = EXCLUDED.status,
      error_msg      = EXCLUDED.error_msg,
      renamed_to     = COALESCE(EXCLUDED.renamed_to, drive_watcher_files.renamed_to),
      client_id      = COALESCE(EXCLUDED.client_id, drive_watcher_files.client_id),
      client_name_raw = COALESCE(EXCLUDED.client_name_raw, drive_watcher_files.client_name_raw),
      exam_document_id = COALESCE(EXCLUDED.exam_document_id, drive_watcher_files.exam_document_id),
      processed_at   = CASE WHEN EXCLUDED.status IN ('processado','erro','ignorado') THEN NOW() ELSE drive_watcher_files.processed_at END
  `);
}

// ─── Extração de nome do paciente a partir do nome do arquivo ─────────────────

/**
 * Tenta extrair o nome do paciente do nome do arquivo.
 * Regras (em ordem de prioridade):
 * 1. "NOME - EXAME.ext" → separa pelo primeiro " - "
 * 2. "NOME_EXAME.ext"   → separa pelo primeiro "_"
 * 3. Usa o nome inteiro (sem extensão) como candidato
 */
export function extractNameFromFilename(filename: string): string {
  const noExt = filename.replace(/\.[^/.]+$/, "").trim();
  // Separador " - "
  if (noExt.includes(" - ")) return noExt.split(" - ")[0].trim();
  // Separador "_"
  if (noExt.includes("_")) return noExt.split("_")[0].trim();
  // Tudo antes de parênteses (ex: "João Silva (Hemograma).pdf")
  const paren = noExt.match(/^([^(]+)/);
  if (paren) return paren[1].trim();
  return noExt;
}

// ─── Criação automática de paciente ──────────────────────────────────────────

async function autoCreateClient(name: string): Promise<number> {
  const [row] = await db
    .insert(clientsTable)
    .values({
      name: name.trim(),
      status: "ativo",
    })
    .returning({ id: clientsTable.id });
  return row.id;
}

// ─── Nomenclatura de arquivo (padrão PAXTER) ─────────────────────────────────

function buildNewName(
  originalName: string,
  clientName: string,
  folderType: "sangue" | "imagem",
  dateStr: string,           // YYYY-MM-DD
): string {
  const ext = (originalName.match(/\.[^/.]+$/) ?? [".pdf"])[0].toLowerCase();
  const yy = dateStr.slice(2, 4);
  const mm = dateStr.slice(5, 7);
  const dd = dateStr.slice(8, 10);
  const datePrefix = `${yy}.${mm}.${dd}`;

  const nomeSlug = clientName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .toUpperCase()
    .slice(0, 32);

  const tipo = folderType === "sangue" ? "EXAME SANGUE" : "EXAME IMAGEM";
  return `${datePrefix} ${tipo} ${nomeSlug}${ext}`;
}

// ─── Estado em memória do worker ─────────────────────────────────────────────

export interface WatcherRunState {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  filesFound: number;
  filesNew: number;
  filesProcessed: number;
  filesError: number;
  clientsCreated: string[];
  log: string[];
}

let _state: WatcherRunState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  filesFound: 0,
  filesNew: 0,
  filesProcessed: 0,
  filesError: 0,
  clientsCreated: [],
  log: [],
};

export function getWatcherState(): WatcherRunState {
  return { ..._state, log: [..._state.log] };
}

function logLine(msg: string): void {
  logger.info(msg);
  _state.log.push(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
  if (_state.log.length > 200) _state.log.shift();
}

// ─── Scan: lista arquivos novos sem processar ─────────────────────────────────

export interface ScanResult {
  folderId: string;
  folderType: "sangue" | "imagem";
  label: string;
  totalFiles: number;
  newFiles: { id: string; name: string }[];
}

export async function scanWatchedFolders(): Promise<ScanResult[]> {
  const known = await getKnownFileIds();
  const results: ScanResult[] = [];

  for (const folder of WATCHED_FOLDERS) {
    let children: Awaited<ReturnType<typeof driveListChildren>>;
    try {
      children = await driveListChildren(folder.id);
    } catch (e) {
      logger.error({ err: String(e) }, `drive-watcher: falha ao listar pasta ${folder.type}`);
      results.push({
        folderId: folder.id,
        folderType: folder.type,
        label: folder.label,
        totalFiles: 0,
        newFiles: [],
      });
      continue;
    }

    const files = children.filter((c) => !c.isFolder && /\.(pdf|jpe?g|png|webp)$/i.test(c.name));
    const newFiles = files.filter((f) => !known.has(f.id));

    results.push({
      folderId: folder.id,
      folderType: folder.type,
      label: folder.label,
      totalFiles: files.length,
      newFiles: newFiles.map((f) => ({ id: f.id, name: f.name })),
    });
  }
  return results;
}

// ─── Process: processa todos os arquivos pendentes ────────────────────────────

export async function processWatchedFolders(opts?: { maxFiles?: number }): Promise<WatcherRunState> {
  if (_state.running) return _state;

  _state = {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    filesFound: 0,
    filesNew: 0,
    filesProcessed: 0,
    filesError: 0,
    clientsCreated: [],
    log: [],
  };

  const maxFiles = opts?.maxFiles ?? 50;

  try {
    await ensureTable();
    const known = await getKnownFileIds();
    const clients = await loadClients();

    const todayStr = new Date().toISOString().slice(0, 10);

    let totalProcessed = 0;

    for (const folder of WATCHED_FOLDERS) {
      if (totalProcessed >= maxFiles) break;

      logLine(`Escaneando pasta: ${folder.label}`);
      let children: Awaited<ReturnType<typeof driveListChildren>>;
      try {
        children = await driveListChildren(folder.id);
      } catch (e) {
        logLine(`ERRO ao listar pasta ${folder.label}: ${String(e)}`);
        continue;
      }

      const files = children.filter((c) => !c.isFolder && /\.(pdf|jpe?g|png|webp)$/i.test(c.name));
      _state.filesFound += files.length;
      const newFiles = files.filter((f) => !known.has(f.id));
      _state.filesNew += newFiles.length;
      logLine(`  ${files.length} arquivo(s) encontrado(s), ${newFiles.length} novo(s)`);

      for (const file of newFiles) {
        if (totalProcessed >= maxFiles) break;

        // Registra como pendente
        await upsertFile({
          fileId: file.id,
          folderId: folder.id,
          folderType: folder.type,
          originalName: file.name,
          status: "pendente",
        });
        known.add(file.id);

        logLine(`  Processando: ${file.name}`);

        try {
          // 1. Identificar paciente
          const candidateName = extractNameFromFilename(file.name);
          const resolved = resolveClient(clients, candidateName, null);
          let clientId: number;
          let clientName: string;
          let autoCreated = false;

          if (resolved) {
            clientId = resolved.id;
            clientName = resolved.name;
            logLine(`    Paciente identificado: ${clientName} (id=${clientId})`);
          } else {
            // Auto-criar paciente com o nome extraído
            clientId = await autoCreateClient(candidateName);
            clientName = candidateName;
            autoCreated = true;
            _state.clientsCreated.push(candidateName);
            logLine(`    Paciente NÃO encontrado — criado automaticamente: "${candidateName}" (id=${clientId})`);
          }

          // 2. Download do arquivo
          const buffer = await driveDownloadFile(file.id);

          // 3. Hash para idempotência
          const hash = createHash("sha256").update(buffer).digest("hex");

          // 4. Nomenclatura: novo nome de arquivo
          const newName = buildNewName(file.name, clientName, folder.type, todayStr);
          logLine(`    Renomeado para: ${newName}`);

          // 5. Extrair conteúdo (PDF de sangue → motor de extração)
          let examDocId: number | undefined;
          if (folder.type === "sangue" && file.name.toLowerCase().endsWith(".pdf")) {
            try {
              const pdfText = await extractPdfText(buffer);

              // Inserir documento
              const [docRow] = await db
                .insert(examDocumentsTable)
                .values({
                  clientId,
                  hash,
                  fileName: newName,
                  examKind: "lab",
                  origin: "drive-watcher",
                  status: "recebido",
                })
                .onConflictDoNothing()
                .returning({ id: examDocumentsTable.id });

              if (docRow) {
                examDocId = docRow.id;
                const extracted = await extractExamFromText(pdfText, { clientName });
                if (extracted && extracted.results.length > 0) {
                  await persistExtractedResults(docRow.id, clientId, extracted);
                  await finalizeDocument(docRow.id, extracted);
                  logLine(`    Extração: ${extracted.results.length} analito(s) extraído(s)`);
                } else {
                  logLine(`    Extração: nenhum analito encontrado`);
                }
              } else {
                logLine(`    Documento já existia (hash duplicado) — pulando`);
              }
            } catch (extractErr) {
              logLine(`    AVISO extração: ${extractErr instanceof Error ? extractErr.message : String(extractErr)}`);
            }
          } else {
            // Imagem ou PDF não-sangue: registra sem extração
            try {
              await db
                .insert(examDocumentsTable)
                .values({
                  clientId,
                  hash,
                  fileName: newName,
                  examKind: "imagem",
                  origin: "drive-watcher",
                  status: "recebido",
                })
                .onConflictDoNothing();
            } catch { /* duplicado */ }
          }

          // 6. Tentar subir ao Drive do paciente (best-effort)
          try {
            const structure = await ensureClientFolderStructure(clientId);
            const targetFolder =
              folder.type === "sangue"
                ? (structure as Record<string, unknown>).exames
                : (structure as Record<string, unknown>).imagens;
            if (targetFolder) {
              await uploadFileToDrive(
                buffer,
                newName,
                "application/pdf",
                targetFolder as string,
                { allowDuplicates: false },
              );
              logLine(`    Upload ao Drive do paciente: OK`);
            }
          } catch (driveErr) {
            logLine(`    AVISO Drive upload: ${driveErr instanceof Error ? driveErr.message : String(driveErr)}`);
          }

          // 7. Marcar como processado
          await upsertFile({
            fileId: file.id,
            folderId: folder.id,
            folderType: folder.type,
            originalName: file.name,
            renamedTo: newName,
            clientId,
            clientNameRaw: candidateName,
            status: "processado",
            examDocumentId: examDocId,
          });

          _state.filesProcessed++;
          totalProcessed++;

        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logLine(`    ERRO: ${msg}`);
          await upsertFile({
            fileId: file.id,
            folderId: folder.id,
            folderType: folder.type,
            originalName: file.name,
            status: "erro",
            errorMsg: msg,
          });
          _state.filesError++;
        }
      }
    }
  } catch (fatal) {
    logLine(`ERRO FATAL: ${fatal instanceof Error ? fatal.message : String(fatal)}`);
  } finally {
    _state.running = false;
    _state.finishedAt = new Date().toISOString();
  }

  return _state;
}

// ─── Status: resumo da tabela ────────────────────────────────────────────────

export async function getWatcherStats(): Promise<{
  total: number;
  processado: number;
  pendente: number;
  erro: number;
  recentes: Record<string, unknown>[];
}> {
  await ensureTable();

  const statsRows = await db.execute(sql`
    SELECT status, COUNT(*) as n
    FROM drive_watcher_files
    GROUP BY status
  `);
  const arr: { status: string; n: string }[] =
    (statsRows as unknown as { rows: { status: string; n: string }[] }).rows ??
    (Array.isArray(statsRows) ? statsRows : []);

  const map: Record<string, number> = {};
  for (const row of arr) map[row.status] = parseInt(row.n, 10);

  const recentRows = await db.execute(sql`
    SELECT file_id, folder_type, original_name, renamed_to, client_name_raw,
           client_id, status, error_msg, processed_at, created_at
    FROM drive_watcher_files
    ORDER BY created_at DESC
    LIMIT 30
  `);
  const recentes: Record<string, unknown>[] =
    (recentRows as unknown as { rows: Record<string, unknown>[] }).rows ??
    (Array.isArray(recentRows) ? recentRows : []);

  return {
    total: Object.values(map).reduce((a, b) => a + b, 0),
    processado: map.processado ?? 0,
    pendente: map.pendente ?? 0,
    erro: map.erro ?? 0,
    recentes,
  };
}
