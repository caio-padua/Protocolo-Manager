/**
 * objectStorageS3 — Bandeira dupla: Replit sidecar (dev) ou S3-compatível (Railway)
 *
 * BANDEIRA DUPLA:
 *   process.env.REPLIT_OBJECT_STORAGE_BUCKET existe  → usa sidecar Replit (desenvolvimento)
 *   variável ausente                                  → usa S3-compatível (Cloudflare R2 / AWS S3)
 *
 * Variáveis de ambiente para S3:
 *   S3_ENDPOINT          — URL do endpoint (ex.: https://<id>.r2.cloudflarestorage.com)
 *   S3_ACCESS_KEY_ID     — Chave de acesso
 *   S3_SECRET_ACCESS_KEY — Segredo
 *   S3_BUCKET_NAME       — Nome do bucket
 *   S3_REGION            — Região (para R2: "auto")
 *
 * Interface pública IDÊNTICA à de objectStorage.ts para permitir substituição sem
 * alterar as rotas e libs que chamam upload/download/delete/getSignedUrl/exists.
 */

import { logger } from "./logger";

// ─── Re-exporta tudo do objectStorage original (ACL, classes de erro) ────────
export {
  ObjectNotFoundError,
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
  objectStorageClient,
  ObjectStorageService,
  PRIVATE_OBJECT_DIR,
} from "./objectStorage";

// ─── Detecção de ambiente ─────────────────────────────────────────────────────

function isReplitEnv(): boolean {
  return !!process.env.REPLIT_OBJECT_STORAGE_BUCKET;
}

// ─── S3 client (carregado só quando não está no Replit) ──────────────────────

type S3Client = import("@aws-sdk/client-s3").S3Client;
type GetObjectCommand = import("@aws-sdk/client-s3").GetObjectCommand;
type PutObjectCommand = import("@aws-sdk/client-s3").PutObjectCommand;
type DeleteObjectCommand = import("@aws-sdk/client-s3").DeleteObjectCommand;
type HeadObjectCommand = import("@aws-sdk/client-s3").HeadObjectCommand;
type GetSignedUrlFn = typeof import("@aws-sdk/s3-request-presigner").getSignedUrl;

let _s3: S3Client | null = null;
let _getSignedUrlFn: GetSignedUrlFn | null = null;
let _cmds: {
  GetObjectCommand: typeof GetObjectCommand;
  PutObjectCommand: typeof PutObjectCommand;
  DeleteObjectCommand: typeof DeleteObjectCommand;
  HeadObjectCommand: typeof HeadObjectCommand;
} | null = null;

async function getS3() {
  if (!_s3) {
    const { S3Client: S3C } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const {
      GetObjectCommand: GOC,
      PutObjectCommand: POC,
      DeleteObjectCommand: DOC,
      HeadObjectCommand: HOC,
    } = await import("@aws-sdk/client-s3");

    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    const region = process.env.S3_REGION ?? "auto";

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "S3 não configurado. Defina S3_ENDPOINT, S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY."
      );
    }

    _s3 = new S3C({ endpoint, credentials: { accessKeyId, secretAccessKey }, region });
    _getSignedUrlFn = getSignedUrl;
    _cmds = { GetObjectCommand: GOC, PutObjectCommand: POC, DeleteObjectCommand: DOC, HeadObjectCommand: HOC };
  }
  return { s3: _s3!, getSignedUrl: _getSignedUrlFn!, cmds: _cmds! };
}

function bucket(): string {
  const b = process.env.S3_BUCKET_NAME;
  if (!b) throw new Error("S3_BUCKET_NAME não definida.");
  return b;
}

// ─── Funções públicas ─────────────────────────────────────────────────────────

/** Grava um arquivo no storage. Retorna a chave (key). */
export async function upload(
  key: string,
  data: Buffer | Uint8Array,
  mimeType: string
): Promise<string> {
  if (isReplitEnv()) {
    const { ObjectStorageService } = await import("./objectStorage");
    const svc = new ObjectStorageService();
    await svc.uploadObject(key, data, mimeType);
    return key;
  }

  const { s3, cmds } = await getS3();
  await s3.send(
    new cmds.PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: data,
      ContentType: mimeType,
    })
  );
  logger.info({ key }, "S3 upload ok");
  return key;
}

/** Baixa um arquivo do storage. Lança ObjectNotFoundError se não existir. */
export async function download(key: string): Promise<Buffer> {
  if (isReplitEnv()) {
    const { ObjectStorageService } = await import("./objectStorage");
    const svc = new ObjectStorageService();
    return svc.downloadObject(key);
  }

  const { s3, cmds } = await getS3();
  try {
    const resp = await s3.send(
      new cmds.GetObjectCommand({ Bucket: bucket(), Key: key })
    );
    const chunks: Uint8Array[] = [];
    const stream = resp.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  } catch (err: unknown) {
    const code = (err as { name?: string }).name;
    if (code === "NoSuchKey" || code === "NotFound") {
      const { ObjectNotFoundError } = await import("./objectStorage");
      throw new ObjectNotFoundError();
    }
    throw err;
  }
}

/** Remove um arquivo do storage. Silencia se já não existir. */
export async function deleteObject(key: string): Promise<void> {
  if (isReplitEnv()) {
    const { ObjectStorageService } = await import("./objectStorage");
    const svc = new ObjectStorageService();
    await svc.deleteObject(key);
    return;
  }

  const { s3, cmds } = await getS3();
  await s3.send(new cmds.DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/** Gera URL pré-assinada para download privado. */
export async function getSignedUrl(
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  if (isReplitEnv()) {
    const { ObjectStorageService } = await import("./objectStorage");
    const svc = new ObjectStorageService();
    return svc.getSignedUrl(key, expiresInSeconds);
  }

  const { s3, getSignedUrl: gsu, cmds } = await getS3();
  return gsu(
    s3,
    new cmds.GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn: expiresInSeconds }
  );
}

/** Verifica se um arquivo existe no storage. */
export async function exists(key: string): Promise<boolean> {
  if (isReplitEnv()) {
    const { ObjectStorageService } = await import("./objectStorage");
    const svc = new ObjectStorageService();
    return svc.objectExists(key);
  }

  try {
    const { s3, cmds } = await getS3();
    await s3.send(new cmds.HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch {
    return false;
  }
}
