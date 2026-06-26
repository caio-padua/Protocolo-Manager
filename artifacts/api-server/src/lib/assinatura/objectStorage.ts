/**
 * Armazenamento permanente dos PDFs assinados — adaptado ao Object Storage do
 * Replit (Paxter), via ObjectStorageService.savePrivateObject/readPrivateObject.
 *
 * O webhook eh server-to-server (ZapSign -> backend -> bucket): basta gravar o
 * Buffer sob `assinaturas/<external_id>.pdf` (objeto PRIVADO, nunca servido por
 * HTTP direto) e ler de volta na rota GET /api/assinaturas/:id/pdf-assinado,
 * que ja passa por requireCollaborator (gate de autorizacao + anti-IDOR).
 */

import { ObjectStorageService } from "../objectStorage";

const storage = new ObjectStorageService();

/** Normaliza o id em um nome de objeto seguro e estavel. */
function pdfObjectName(externalIdOuEnvelope: string): string {
  const safe = externalIdOuEnvelope.replace(/[^A-Za-z0-9._-]/g, "_");
  return `assinaturas/${safe}.pdf`;
}

export interface UploadPdfAssinadoResult {
  storageKey: string;
  bytes: number;
}

/**
 * Faz upload do PDF assinado no Object Storage privado. Idempotente: se ja
 * existir, sobrescreve (o conteudo eh determinístico pelo envelope assinado).
 * Retorna a storageKey logica (`assinaturas/<id>.pdf`) pra gravar na solicitacao.
 */
export async function uploadPdfAssinado(
  externalIdOuEnvelope: string,
  pdf: Buffer,
): Promise<UploadPdfAssinadoResult> {
  const objectName = pdfObjectName(externalIdOuEnvelope);
  const storageKey = await storage.savePrivateObject(objectName, pdf, "application/pdf");
  return { storageKey, bytes: pdf.length };
}

export class PdfAssinadoNaoEncontradoError extends Error {
  constructor(public readonly storageKey: string) {
    super(`PDF assinado nao encontrado em storage: ${storageKey}`);
    this.name = "PdfAssinadoNaoEncontradoError";
  }
}

/**
 * Le o PDF assinado de volta para a memoria do servidor. Aceita tanto a
 * storageKey logica (`assinaturas/<id>.pdf`) quanto o id/envelope puro.
 */
export async function readPdfAssinado(storageKey: string): Promise<Buffer> {
  const objectName = storageKey.includes("/")
    ? storageKey
    : pdfObjectName(storageKey);
  try {
    return await storage.readPrivateObject(objectName);
  } catch (e) {
    throw new PdfAssinadoNaoEncontradoError(storageKey + " (" + (e as Error).message + ")");
  }
}
