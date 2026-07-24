import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

// ============================================================================
// Cofre interno de arquivos de exame (Onda B da spec captacao-exames-fusao)
// Guarda os bytes de cada documento dentro do sistema (tabela bytea) para
// download imediato sem depender do Google Drive.
// ============================================================================

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

let tableEnsured = false;

export async function ensureFileStoreTable(): Promise<void> {
  if (tableEnsured) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS exam_document_files (
      document_id INTEGER PRIMARY KEY,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      bytes BYTEA NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  tableEnsured = true;
}

export async function saveInternalCopy(params: {
  documentId: number;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<boolean> {
  try {
    if (params.buffer.length > MAX_BYTES) {
      logger.warn(
        { documentId: params.documentId, size: params.buffer.length },
        "[FileStore] arquivo acima de 25 MB — cópia interna não gravada",
      );
      return false;
    }
    await ensureFileStoreTable();
    await db.execute(sql`
      INSERT INTO exam_document_files (document_id, file_name, mime_type, bytes, size_bytes)
      VALUES (${params.documentId}, ${params.fileName}, ${params.mimeType}, ${params.buffer}, ${params.buffer.length})
      ON CONFLICT (document_id) DO UPDATE SET
        file_name = EXCLUDED.file_name,
        mime_type = EXCLUDED.mime_type,
        bytes = EXCLUDED.bytes,
        size_bytes = EXCLUDED.size_bytes
    `);
    return true;
  } catch (err) {
    logger.error(
      { documentId: params.documentId, err: err instanceof Error ? err.message : String(err) },
      "[FileStore] falha ao gravar cópia interna",
    );
    return false;
  }
}

export async function getInternalCopy(documentId: number): Promise<{
  fileName: string;
  mimeType: string;
  bytes: Buffer;
} | null> {
  await ensureFileStoreTable();
  const rows = await db.execute(sql`
    SELECT file_name, mime_type, bytes FROM exam_document_files WHERE document_id = ${documentId}
  `);
  const arr: { file_name: string; mime_type: string; bytes: Buffer }[] =
    (rows as unknown as { rows: any[] }).rows ?? (Array.isArray(rows) ? (rows as any[]) : []);
  if (!arr.length) return null;
  const r = arr[0];
  const raw = r.bytes as unknown;
  const buf =
    Buffer.isBuffer(raw)
      ? raw
      : typeof raw === "string" && raw.startsWith("\\x")
        ? Buffer.from(raw.slice(2), "hex")
        : Buffer.from(raw as any);
  return { fileName: r.file_name, mimeType: r.mime_type, bytes: buf };
}

export async function hasInternalCopy(documentId: number): Promise<boolean> {
  await ensureFileStoreTable();
  const rows = await db.execute(sql`
    SELECT 1 AS ok FROM exam_document_files WHERE document_id = ${documentId} LIMIT 1
  `);
  const arr = (rows as unknown as { rows: any[] }).rows ?? (Array.isArray(rows) ? (rows as any[]) : []);
  return arr.length > 0;
}
