import { createHash } from "node:crypto";
import { db, clientsTable, examDocumentsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  driveListChildren,
  driveDownloadFile,
  uploadFileToDrive,
  ensureClientFolderStructure,
  driveCopyFileInFolder,
} from "./google-drive.js";
import { extractExamFromMedia } from "./exam-extraction/extract.js";
import { extractPdfText } from "./exam-extraction/pdf-text.js";
import {
  persistExtractedResults,
  finalizeDocument,
  markDocumentError,
} from "./exam-extraction/persist.js";
import { normalizeName, loadClients, resolveClient } from "./drive-import/matcher.js";
import { saveInternalCopy, hasInternalCopy } from "./exam-file-store.js";
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
    type: "misto" as const,
    label: "EXAMES CLIENTES (SANGUE IMAGEM OUTROS)",
    driveSubfolder: "EXAMES",
  },
  {
    id: "1Z2Z-NVbC8txbdNgn4R-AaTNS7Vhnf89F",
    type: "imagem" as const,
    label: "Exames de Imagem",
    driveSubfolder: "IMAGENS",
  },
];

export type FolderKind = (typeof WATCHED_FOLDERS)[number]["type"];

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
  await db.execute(sql`ALTER TABLE drive_watcher_files ADD COLUMN IF NOT EXISTS copied_drive_id TEXT`);
  await db.execute(sql`ALTER TABLE drive_watcher_files ADD COLUMN IF NOT EXISTS copied_name TEXT`);
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
  copiedDriveId?: string;
  copiedName?: string;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO drive_watcher_files
      (file_id, folder_id, folder_type, original_name, client_id, client_name_raw, status, error_msg, renamed_to, exam_document_id, copied_drive_id, copied_name)
    VALUES
      (${params.fileId}, ${params.folderId}, ${params.folderType}, ${params.originalName},
       ${params.clientId ?? null}, ${params.clientNameRaw ?? null},
       ${params.status ?? "pendente"}, ${params.errorMsg ?? null},
       ${params.renamedTo ?? null}, ${params.examDocumentId ?? null},
       ${params.copiedDriveId ?? null}, ${params.copiedName ?? null})
    ON CONFLICT (file_id) DO UPDATE SET
      status           = EXCLUDED.status,
      error_msg        = EXCLUDED.error_msg,
      renamed_to       = COALESCE(EXCLUDED.renamed_to, drive_watcher_files.renamed_to),
      client_id        = COALESCE(EXCLUDED.client_id, drive_watcher_files.client_id),
      client_name_raw  = COALESCE(EXCLUDED.client_name_raw, drive_watcher_files.client_name_raw),
      exam_document_id = COALESCE(EXCLUDED.exam_document_id, drive_watcher_files.exam_document_id),
      copied_drive_id  = COALESCE(EXCLUDED.copied_drive_id, drive_watcher_files.copied_drive_id),
      copied_name      = COALESCE(EXCLUDED.copied_name, drive_watcher_files.copied_name),
      processed_at     = CASE WHEN EXCLUDED.status IN ('processado','erro','ignorado') THEN NOW() ELSE drive_watcher_files.processed_at END
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
// UUID puro: 8-4-4-4-12 hex (sem espaços = não é nome de paciente)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function extractNameFromFilename(filename: string): string | null {
  const noExt = filename.replace(/\.[^/.]+$/, "").trim();
  // UUID puro → sem nome no filename
  if (UUID_RE.test(noExt)) return null;
  // Separador " - "
  if (noExt.includes(" - ")) return noExt.split(" - ")[0].trim() || null;
  // Separador "_"  (ex: "JOAO_SILVA_hemograma.pdf")
  if (noExt.includes("_")) return noExt.split("_")[0].trim() || null;
  // Tudo antes de parênteses (ex: "João Silva (Hemograma).pdf")
  const paren = noExt.match(/^([^(]+)/);
  const candidate = paren?.[1]?.trim();
  // Se o "candidato" parece só números/hifens/maiúsculas sem vogal = código, não nome
  if (candidate && /^[A-Z0-9\-]{6,}$/.test(candidate)) return null;
  return candidate || null;
}

// ─── Criação automática de paciente ──────────────────────────────────────────

async function autoCreateClient(name: string): Promise<number> {
  const [row] = await db
    .insert(clientsTable)
    .values({
      name: name.trim(),
      status: "active",
      empresaId: 5,
    })
    .returning({ id: clientsTable.id });
  return row.id;
}

// ─── Nomenclatura de arquivo (padrão PAXTER) ─────────────────────────────────

function buildNewName(
  originalName: string,
  clientName: string,
  dateStr: string,           // YYYY-MM-DD
): string {
  const ext = (originalName.match(/\.[^/.]+$/) ?? [".pdf"])[0].toLowerCase();
  const yy = dateStr.slice(2, 4);
  const mm = dateStr.slice(5, 7);
  const dd = dateStr.slice(8, 10);
  const datePrefix = `${yy}.${mm}.${dd}`;

  let nomeSlug = clientName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .toUpperCase()
    .slice(0, 40);

  // Evitar duplicata: se o "nome do cliente" veio do filename e contém tipo de exame
  const tipoRegex = /^(EXAME\s+SANGUE|EXAME\s+IMAGEM|LAUDO\s+COMPLETO|LAUDO\s+)\s*/i;
  nomeSlug = nomeSlug.replace(tipoRegex, "").trim().slice(0, 40) || nomeSlug.slice(0, 40);

  return `${datePrefix} ${nomeSlug}${ext}`;
}

/**
 * Dupla checagem da data do laudo (criticidade médica):
 * aceita DD/MM/AAAA extraída do CONTEÚDO; rejeita futura ou > 5 anos atrás.
 * Retorna ISO YYYY-MM-DD ou null se inválida.
 */
export function validateExamDate(brDate: string | null | undefined): string | null {
  if (!brDate) return null;
  const m = brDate.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const iso = `${yyyy}-${mm}-${dd}`;
  const d = new Date(`${iso}T12:00:00Z`);
  if (isNaN(d.getTime())) return null;
  const now = Date.now();
  if (d.getTime() > now + 24 * 3600 * 1000) return null;                 // futura
  if (d.getTime() < now - 5 * 365 * 24 * 3600 * 1000) return null;       // > 5 anos
  return iso;
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
  folderType: FolderKind;
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

    // ── Coletar a fila de arquivos novos de todas as pastas vigiadas ──────────
    type QueueItem = { file: { id: string; name: string }; folder: (typeof WATCHED_FOLDERS)[number] };
    const queue: QueueItem[] = [];

    for (const folder of WATCHED_FOLDERS) {
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

      for (const f of newFiles) {
        if (queue.length >= maxFiles) break;
        queue.push({ file: { id: f.id, name: f.name }, folder });
        known.add(f.id);
      }
    }

    // ── Processar um arquivo (Onda A: extração ANTES do renomeio p/ data do laudo) ──
    const processOne = async ({ file, folder }: QueueItem): Promise<void> => {
      await upsertFile({
        fileId: file.id,
        folderId: folder.id,
        folderType: folder.type,
        originalName: file.name,
        status: "pendente",
      });
      logLine(`  Processando: ${file.name}`);

      try {
        // 1. Download do arquivo
        const buffer = await driveDownloadFile(file.id);
        const isPdf = file.name.toLowerCase().endsWith(".pdf");

        // 2. Identificar paciente
        let candidateName: string | null = extractNameFromFilename(file.name);

        if (!candidateName && isPdf) {
          try {
            const rawResult = await extractPdfText(buffer);
            const rawText = rawResult.text;
            const namePatterns = [
              /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ '\-]{3,59})\s*\n(?:Gênero|Genero):/,
              /(?:nome do paciente|paciente)[:\s]+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ '\-]{3,59})/i,
              /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ '\-]{3,59})\s*\nCPF:/i,
              /(?:paciente|nome)[:\s]+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ '\-]{3,59})/i,
            ];
            for (const pat of namePatterns) {
              const match = rawText.match(pat);
              if (match?.[1]) {
                const candidate = match[1].trim();
                if (!/^(dr|dra|medico|enfermeiro|laboratorio|resultado|material)/i.test(candidate)) {
                  candidateName = candidate;
                  logLine(`    Nome extraído do PDF: "${candidateName}"`);
                  break;
                }
              }
            }
          } catch { /* PDF não legível — continua sem nome */ }
        }

        let clientId: number;
        let clientName: string;

        if (candidateName) {
          const outcome = resolveClient(clients, candidateName);
          if (outcome.kind === "matched") {
            clientId = outcome.client.id;
            clientName = outcome.client.name ?? candidateName;
            logLine(`    Paciente identificado: ${clientName} (id=${clientId})`);
          } else {
            clientId = await autoCreateClient(candidateName);
            clientName = candidateName;
            _state.clientsCreated.push(candidateName);
            logLine(`    Paciente NÃO encontrado — criado automaticamente: "${candidateName}" (id=${clientId})`);
          }
        } else {
          logLine(`    Nome de paciente não identificado — marcado para revisão manual`);
          await upsertFile({
            fileId: file.id,
            folderId: folder.id,
            folderType: folder.type,
            originalName: file.name,
            status: "pendente_revisao",
            errorMsg: "Nome do paciente não identificado no filename nem no conteúdo do PDF",
          });
          _state.filesError++;
          return;
        }

        // 3. Hash para idempotência
        const hash = createHash("sha256").update(buffer).digest("hex");

        // 4. Extrair conteúdo ANTES do renomeio (pasta mista: PDF tenta sangue primeiro).
        //    A data de coleta extraída do CONTEÚDO alimenta o nome (dupla checagem).
        const tryBlood = isPdf && (folder.type === "misto" || (folder.type as string) === "sangue");
        let extraction: Awaited<ReturnType<typeof extractExamFromMedia>> | null = null;
        if (tryBlood) {
          try {
            extraction = await extractExamFromMedia(buffer, "application/pdf");
          } catch (extractErr) {
            logLine(`    AVISO extração: ${extractErr instanceof Error ? extractErr.message : String(extractErr)}`);
          }
        }
        const analytes = extraction?.data.analytes.length ?? 0;
        const isBlood = analytes > 0;

        // Dupla checagem da data (criticidade médica)
        const laudoDate = validateExamDate(extraction?.data.collectionDate);
        const effectiveDate = laudoDate ?? todayStr;
        if (extraction && !laudoDate) {
          logLine(`    AVISO data: data do laudo ausente/inválida ("${extraction.data.collectionDate ?? "—"}") — usando data de hoje`);
        } else if (laudoDate) {
          logLine(`    Data validada pelo conteúdo do laudo: ${laudoDate}`);
        }

        // 5. Nomenclatura: aa.mm.dd NOME PACIENTE.ext
        const newName = buildNewName(file.name, clientName, effectiveDate);
        logLine(`    Renomeado para: ${newName}`);

        // 6. Registrar documento (idempotente por hash) e persistir resultados
        // A4: 0 analitos só vira "imagem" se a extensão for de imagem ou o nome sugerir imagem;
        // PDF sem analitos e sem indício de imagem fica "lab" (falha de extração não mascarada).
        const nameSuggestsImage = /\b(usg|ultrass?om?|rx|raio|rmn|resson|tc\b|tomo|densito|doppler|mamogra|eco|imagem|angio)/i.test(file.name);
        const examKind = isBlood ? "lab" : (!isPdf || nameSuggestsImage ? "imagem" : "lab");
        let examDocId: number | undefined;
        try {
          const [docRow] = await db
            .insert(examDocumentsTable)
            .values({
              clientId,
              empresaId: 5,
              hash,
              fileName: newName,
              examKind,
              origin: "drive-watcher",
              status: "recebido",
              sourcePdfDriveId: file.id,
              sourcePath: file.name,
            })
            .onConflictDoNothing()
            .returning({ id: examDocumentsTable.id });

          if (docRow) {
            examDocId = docRow.id;
            if (isBlood && extraction) {
              await finalizeDocument(docRow.id, extraction.data, extraction.modelUsed);
              await persistExtractedResults({ documentId: docRow.id, clientId, extracted: extraction.data });
              logLine(`    Extração (vision): ${analytes} analito(s) extraído(s)`);
            } else if (tryBlood) {
              logLine(`    Extração (vision): nenhum analito — registrado como "${examKind}"`);
            }
            // Onda B: cópia interna (cofre do sistema)
            const mime = isPdf ? "application/pdf" : `image/${(file.name.match(/\.(\w+)$/)?.[1] ?? "png").replace("jpg", "jpeg")}`;
            const saved = await saveInternalCopy({ documentId: docRow.id, fileName: newName, mimeType: mime, buffer });
            if (saved) logLine(`    Cópia interna gravada no cofre do sistema (doc=${docRow.id})`);
          } else {
            logLine(`    Documento já existia (hash duplicado) — garantindo cópia interna`);
            const existing = await db
              .select({ id: examDocumentsTable.id })
              .from(examDocumentsTable)
              .where(eq(examDocumentsTable.hash, hash))
              .limit(1);
            if (existing[0]) {
              examDocId = existing[0].id;
              const already = await hasInternalCopy(existing[0].id);
              if (!already) {
                const mime = isPdf ? "application/pdf" : "image/png";
                await saveInternalCopy({ documentId: existing[0].id, fileName: newName, mimeType: mime, buffer });
              }
            }
          }
        } catch (docErr) {
          logLine(`    AVISO documento: ${docErr instanceof Error ? docErr.message : String(docErr)}`);
        }

        // 7. Copiar para a pasta pessoal do paciente no Drive (destino principal)
        let copiedDriveId: string | undefined;
        let clientExamesFolderId: string | undefined;
        try {
          const [clientRow] = await db
            .select({ name: clientsTable.name, cpf: clientsTable.cpf })
            .from(clientsTable)
            .where(eq(clientsTable.id, clientId))
            .limit(1);
          if (!clientRow) throw new Error(`Cliente id=${clientId} não encontrado`);
          const structure = await ensureClientFolderStructure(clientRow.name, clientRow.cpf ?? "");
          const subs = structure.subfolders as Record<string, string>;
          clientExamesFolderId = isBlood || isPdf
            ? (subs["EXAMES"] ?? subs["Exames"])
            : (subs["IMAGENS"] ?? subs["Imagens"]);
          logLine(`    Pasta do paciente resolvida: ${clientExamesFolderId ?? "(não encontrada)"}`);
        } catch (structErr) {
          logLine(`    AVISO estrutura Drive: ${structErr instanceof Error ? structErr.message : String(structErr)}`);
        }

        const copyDestFolder = clientExamesFolderId ?? folder.id;
        const copyDestLabel = clientExamesFolderId ? "pasta pessoal do paciente" : "pasta vigiada (fallback)";
        try {
          const copied = await driveCopyFileInFolder(file.id, copyDestFolder, newName);
          copiedDriveId = copied.fileId;
          logLine(`    Cópia canônica criada na ${copyDestLabel}: ${newName} (id=${copied.fileId})`);
        } catch (copyErr) {
          logLine(`    AVISO cópia no Drive: ${copyErr instanceof Error ? copyErr.message : String(copyErr)}`);
        }

        // 8. Marcar como processado
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
          copiedDriveId,
          copiedName: copiedDriveId ? newName : undefined,
        });

        _state.filesProcessed++;
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
    };

    // ── Onda D: pool de concorrência = 2 (rápido sem travar o servidor) ────────
    const CONCURRENCY = 2;
    let cursor = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (cursor < queue.length) {
        const item = queue[cursor++];
        await processOne(item);
      }
    });
    await Promise.all(workers);
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
