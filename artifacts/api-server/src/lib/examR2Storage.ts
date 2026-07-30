/**
 * examR2Storage — espelho de exames no cofre de objetos (Item 40).
 *
 * ESPELHO, NÃO TROCA. O Google Drive continua funcionando como antes.
 * Esta lib apenas grava uma cópia no Object Storage (GCS/Replit App Storage,
 * compatível S3). Quando credenciais Cloudflare R2 estiverem disponíveis,
 * basta trocar o provider em ObjectStorageService — a interface não muda.
 *
 * CONVENÇÃO DE CHAVE (imutável após definida):
 *   exames/cliente-<clientId>/<aaaa-mm-dd>/exame-<documentId>.pdf
 *
 * IDEMPOTÊNCIA (Art. 57 da Bíblia):
 *   Mesmo (clientId, documentId, date) → mesmo caminho → file.save() sobrescreve
 *   com os mesmos bytes. Gravar duas vezes não duplica nem corrompe.
 *
 * DRY-RUN (Art. 58 da Bíblia):
 *   dryRun=true retorna o que SERIA gravado sem escrever nenhum byte.
 */

import { ObjectStorageService, objectStorageClient } from "./objectStorage";

const storage = new ObjectStorageService();

// ─── Chave padronizada ────────────────────────────────────────────────────────

/**
 * Gera a chave canônica do exame no cofre.
 * collectionDate deve estar em formato ISO "YYYY-MM-DD"; se ausente usa hoje.
 */
export function examR2Key(opts: {
  clientId: number;
  documentId: number;
  collectionDate: string | null | undefined;
}): string {
  const date = opts.collectionDate ?? new Date().toISOString().slice(0, 10);
  return `exames/cliente-${opts.clientId}/${date}/exame-${opts.documentId}.pdf`;
}

// ─── Verificação de existência ────────────────────────────────────────────────

async function existsInStorage(relPath: string): Promise<boolean> {
  try {
    let dir = storage.getPrivateObjectDir();
    if (!dir.endsWith("/")) dir = `${dir}/`;
    const fullPath = `${dir}${relPath}`;
    // parseObjectPath: primeiro segmento = bucket, resto = object
    const withoutLeadingSlash = fullPath.startsWith("/") ? fullPath.slice(1) : fullPath;
    const parts = withoutLeadingSlash.split("/");
    const bucketName = parts[0];
    const objectName = parts.slice(1).join("/");
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    return exists;
  } catch {
    // Se não conseguir verificar (bucket não configurado, etc.), trata como ausente
    return false;
  }
}

// ─── Resultado ────────────────────────────────────────────────────────────────

export interface ExamR2Result {
  /** Chave gerada para este exame no cofre de objetos */
  r2Key: string;
  /** O arquivo já existia antes desta chamada? */
  alreadyExists: boolean;
  /** Foi efetivamente gravado agora? (false em dry-run ou se já existia e pulou) */
  uploaded: boolean;
  /** Tamanho do buffer em bytes */
  bytes: number;
  /** true = simulação; nenhum byte foi gravado */
  dryRun: boolean;
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Grava (ou simula a gravação de) um PDF de exame no cofre de objetos.
 *
 * Uso em produção (dentro do pipeline de processamento):
 *   await mirrorExamToR2({ clientId, documentId, collectionDate, buffer });
 *
 * Uso em dry-run (rota GET /exames-lab/r2-dry-run):
 *   await mirrorExamToR2({ clientId, documentId, collectionDate, buffer, dryRun: true });
 */
export async function mirrorExamToR2(opts: {
  clientId: number;
  documentId: number;
  collectionDate: string | null | undefined;
  buffer: Buffer;
  dryRun?: boolean;
}): Promise<ExamR2Result> {
  const key = examR2Key({
    clientId: opts.clientId,
    documentId: opts.documentId,
    collectionDate: opts.collectionDate,
  });

  const alreadyExists = await existsInStorage(key);

  if (opts.dryRun) {
    return { r2Key: key, alreadyExists, uploaded: false, bytes: opts.buffer.length, dryRun: true };
  }

  // Grava — idempotente: mesmo caminho sobrescreve com os mesmos bytes
  await storage.savePrivateObject(key, opts.buffer, "application/pdf");

  return { r2Key: key, alreadyExists, uploaded: true, bytes: opts.buffer.length, dryRun: false };
}
