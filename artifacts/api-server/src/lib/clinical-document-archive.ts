import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";

export type ArchivedClinicalDocumentType =
  | "protocolo"
  | "ras_fap"
  | "carta_tratamento"
  | "documento_assinado";

export interface ArchiveClinicalDocumentInput {
  documentType: ArchivedClinicalDocumentType;
  sourceId: string | number;
  clientId: number;
  empresaId: number;
  locationId: number;
  professionalId: number | null;
  documentLabel: string;
  fileName: string;
  issuedAt: string;
  signatureStatus: string;
  bytes: Buffer;
  finalizeImmediately?: boolean;
}

export interface ArchivedClinicalDocument {
  id: number;
  documentType: ArchivedClinicalDocumentType;
  sourceId: string;
  clientId: number;
  empresaId: number;
  locationId: number;
  professionalId: number | null;
  documentLabel: string;
  fileName: string;
  issuedAt: string;
  signatureStatus: string;
  pdfData: string;
  pdfSha256: string;
  status: "emitted";
}

export async function archiveClinicalDocument(input: ArchiveClinicalDocumentInput): Promise<number> {
  if (!input.bytes.length || input.bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("O documento oficial não contém um PDF válido para arquivamento.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issuedAt)) {
    throw new Error("A data original de emissão está ausente ou inválida.");
  }
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const storageKey = `clinical-document-archives/${input.empresaId}/${input.locationId}/${input.clientId}/${randomUUID()}.pdf`;
  const inserted = await db.execute(sql`
    INSERT INTO clinical_document_archives (
      document_type, source_id, client_id, empresa_id, location_id, professional_id,
      document_label, file_name, issued_at, signature_status, storage_key, archive_status
    ) VALUES (
      ${input.documentType}, ${String(input.sourceId)}, ${input.clientId}, ${input.empresaId},
      ${input.locationId}, ${input.professionalId}, ${input.documentLabel}, ${input.fileName},
      ${input.issuedAt}, ${input.signatureStatus}, ${storageKey}, 'archiving'
    )
    RETURNING id
  `);
  const id = Number((inserted.rows[0] as { id: string | number }).id);
  const storage = new ObjectStorageService();
  try {
    await storage.savePrivateObject(storageKey, input.bytes, "application/pdf");
    await db.execute(sql`
      UPDATE clinical_document_archives
         SET pdf_sha256 = ${sha256},
             archive_status = ${input.finalizeImmediately === false ? "archiving" : "emitted"}
       WHERE id = ${id} AND archive_status = 'archiving'
    `);
    return id;
  } catch (error) {
    await db.execute(sql`
      UPDATE clinical_document_archives
         SET archive_status = 'failed'
       WHERE id = ${id} AND archive_status = 'archiving'
    `).catch(() => undefined);
    await storage.deletePrivateObject(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function finalizeArchivedClinicalDocument(
  id: number,
  status: "emitted" | "failed",
): Promise<void> {
  await db.execute(sql`
    UPDATE clinical_document_archives
       SET archive_status = ${status}
     WHERE id = ${id} AND archive_status = 'archiving' AND pdf_sha256 IS NOT NULL
  `);
}

export async function getArchivedClinicalDocument(
  documentType: ArchivedClinicalDocumentType,
  documentId: number,
): Promise<ArchivedClinicalDocument | null> {
  const result = await db.execute(sql`
    SELECT id, document_type, source_id, client_id, empresa_id, location_id, professional_id,
           document_label, file_name, issued_at, signature_status, storage_key, pdf_sha256
      FROM clinical_document_archives
     WHERE id = ${documentId} AND document_type = ${documentType} AND archive_status = 'emitted'
     LIMIT 1
  `);
  const row = result.rows[0] as {
    id: string | number;
    document_type: ArchivedClinicalDocumentType;
    source_id: string;
    client_id: string | number;
    empresa_id: string | number;
    location_id: string | number;
    professional_id: string | number | null;
    document_label: string;
    file_name: string;
    issued_at: Date | string;
    signature_status: string;
    storage_key: string;
    pdf_sha256: string;
  } | undefined;
  if (!row || !row.pdf_sha256) return null;
  try {
    const bytes = await new ObjectStorageService().readPrivateObject(row.storage_key);
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (!bytes.length || bytes.subarray(0, 5).toString("ascii") !== "%PDF-" || hash !== row.pdf_sha256) return null;
    const issuedAt = row.issued_at instanceof Date
      ? row.issued_at.toISOString().slice(0, 10)
      : String(row.issued_at).slice(0, 10);
    return {
      id: Number(row.id),
      documentType: row.document_type,
      sourceId: row.source_id,
      clientId: Number(row.client_id),
      empresaId: Number(row.empresa_id),
      locationId: Number(row.location_id),
      professionalId: row.professional_id === null ? null : Number(row.professional_id),
      documentLabel: row.document_label,
      fileName: row.file_name,
      issuedAt,
      signatureStatus: row.signature_status,
      pdfData: bytes.toString("base64"),
      pdfSha256: hash,
      status: "emitted",
    };
  } catch {
    return null;
  }
}
