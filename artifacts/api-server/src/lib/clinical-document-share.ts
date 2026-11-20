import { createHash, randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  db,
  clientsTable,
  examRequestPdfsTable,
  medicalCertificatesTable,
  prescriptionsTable,
  recipesTable,
  referralsTable,
  assinaturaSolicitacoesTable,
} from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";
import { getArchivedClinicalDocument } from "./clinical-document-archive";

export type ClinicalDocumentType =
  | "prescricao"
  | "pedido_exames"
  | "atestado"
  | "encaminhamento"
  | "protocolo"
  | "ras_fap"
  | "carta_tratamento"
  | "documento_assinado";

export const CLINICAL_DOCUMENT_SHARE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function issuedDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

export function hashClinicalShareToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function criarTokenClinicalShare() {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashClinicalShareToken(token),
    expiresAt: new Date(Date.now() + CLINICAL_DOCUMENT_SHARE_LIFETIME_MS).toISOString(),
  };
}

export interface IssuedDocumentSummary {
  documentType: ClinicalDocumentType;
  documentId: number;
  label: string;
  issuedAt: string;
  signatureStatus: string;
  pdfSha256: string;
  professionalId: number | null;
}

export async function listIssuedDocumentsForClient(input: {
  clientId: number;
  empresaId: number;
  locationId: number;
}): Promise<IssuedDocumentSummary[]> {
  const [recipeRows, examRows, certificateRows, referralRows, archiveRows, signedRows] = await Promise.all([
    db.execute(sql`SELECT r.id FROM recipes r
      JOIN prescriptions p ON p.id=r.prescription_id
      WHERE p.client_id=${input.clientId} AND p.empresa_id=${input.empresaId}
        AND p.status='emitted' AND p.signature_status='signed'
        AND p.emitted_at IS NOT NULL AND r.pdf_data IS NOT NULL AND r.pdf_data<>''
      ORDER BY p.emitted_at DESC,r.id DESC LIMIT 100`),
    db.execute(sql`SELECT id FROM exam_request_pdfs WHERE client_id=${input.clientId}
      AND pdf_data IS NOT NULL AND pdf_data<>'' ORDER BY created_at DESC,id DESC LIMIT 100`),
    db.execute(sql`SELECT id FROM medical_certificates WHERE client_id=${input.clientId}
      AND status='emitted' AND emitted_at IS NOT NULL AND pdf_data IS NOT NULL AND pdf_data<>''
      ORDER BY emitted_at DESC,id DESC LIMIT 100`),
    db.execute(sql`SELECT id FROM referrals WHERE client_id=${input.clientId}
      AND status='emitted' AND emitted_at IS NOT NULL AND pdf_data IS NOT NULL AND pdf_data<>''
      ORDER BY emitted_at DESC,id DESC LIMIT 100`),
    db.execute(sql`SELECT id,document_type FROM clinical_document_archives
      WHERE client_id=${input.clientId} AND empresa_id=${input.empresaId}
        AND location_id=${input.locationId} AND archive_status='emitted'
      ORDER BY issued_at DESC,id DESC LIMIT 200`),
    db.execute(sql`SELECT id FROM assinatura_solicitacoes
      WHERE paciente_id=${input.clientId} AND status='CONCLUIDO'
        AND pdf_storage_key IS NOT NULL AND hash_assinado IS NOT NULL
      ORDER BY concluido_em DESC,id DESC LIMIT 100`),
  ]);

  const ids: Array<{ type: ClinicalDocumentType; id: number }> = [];
  const addRows = (rows: unknown[], type: ClinicalDocumentType) => {
    for (const row of rows as Array<{ id: string | number }>) {
      const id = Number(row.id);
      if (Number.isSafeInteger(id) && id > 0) ids.push({ type, id });
    }
  };
  addRows(recipeRows.rows, "prescricao");
  addRows(examRows.rows, "pedido_exames");
  addRows(certificateRows.rows, "atestado");
  addRows(referralRows.rows, "encaminhamento");
  for (const row of archiveRows.rows as Array<{ id: string | number; document_type: string }>) {
    const type = row.document_type as ClinicalDocumentType;
    if (["protocolo", "ras_fap", "carta_tratamento"].includes(type)) {
      const id = Number(row.id);
      if (Number.isSafeInteger(id) && id > 0) ids.push({ type, id });
    }
  }
  addRows(signedRows.rows, "documento_assinado");

  const summaries = await Promise.all(ids.map(async ({ type, id }) => {
    const document = await getIssuedDocument(type, id);
    if (!document || document.status !== "emitted" || !document.issuedAt ||
        document.clientId !== input.clientId || document.empresaId !== input.empresaId ||
        document.locationId !== input.locationId ||
        (type !== "documento_assinado" && !document.professionalId) ||
        ((type === "prescricao" || type === "documento_assinado") && document.signatureStatus !== "signed")) return null;
    const bytes = Buffer.from(document.pdfData ?? "", "base64");
    if (!bytes.length || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") return null;
    return {
      documentType: type,
      documentId: id,
      label: document.label,
      issuedAt: document.issuedAt,
      signatureStatus: document.signatureStatus ?? "not_required",
      pdfSha256: createHash("sha256").update(bytes).digest("hex"),
      professionalId: document.professionalId ?? null,
    } satisfies IssuedDocumentSummary;
  }));
  return summaries.filter((row): row is IssuedDocumentSummary => row !== null)
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || b.documentId - a.documentId)
    .slice(0, 200);
}


type IssueScopeTable = "prescriptions" | "exam_request_pdfs" | "medical_certificates" | "referrals";

/** Clínica/unidade gravadas na emissão. Nulo = documento antigo sem escopo verificável. */
async function readIssueScope(table: IssueScopeTable, id: number) {
  const result = await db.execute(sql.raw(
    `SELECT issued_empresa_id, issued_location_id FROM ${table} WHERE id = ${Number(id)} LIMIT 1`,
  ));
  const row = result.rows[0] as { issued_empresa_id: number | null; issued_location_id: number | null } | undefined;
  const empresaId = row?.issued_empresa_id ?? null;
  const locationId = row?.issued_location_id ?? null;
  return empresaId && locationId ? { empresaId, locationId } : { empresaId: null, locationId: null };
}

export async function getIssuedDocument(type: ClinicalDocumentType, documentId: number) {
  if (type === "protocolo" || type === "ras_fap" || type === "carta_tratamento") {
    const archived = await getArchivedClinicalDocument(type, documentId);
    if (!archived) return null;
    return {
      id: archived.id,
      clientId: archived.clientId,
      professionalId: archived.professionalId,
      status: archived.status,
      signatureStatus: archived.signatureStatus,
      issuedAt: archived.issuedAt,
      pdfData: archived.pdfData,
      fileName: archived.fileName,
      label: archived.documentLabel,
      empresaId: archived.empresaId,
      locationId: archived.locationId,
    };
  }
  if (type === "documento_assinado") {
    const [row] = await db.select().from(assinaturaSolicitacoesTable)
      .where(eq(assinaturaSolicitacoesTable.id, documentId)).limit(1);
    if (!row || row.status !== "CONCLUIDO" || !row.pacienteId || !row.pdfStorageKey || !row.hashAssinado || !row.concluidoEm) return null;
    const metadata = row.metadata && typeof row.metadata === "object"
      ? row.metadata as Record<string, unknown> : {};
    const empresaId = Number(metadata.empresaId ?? metadata.empresa_id);
    const locationId = Number(metadata.locationId ?? metadata.location_id);
    if (!Number.isSafeInteger(empresaId) || empresaId <= 0 ||
        !Number.isSafeInteger(locationId) || locationId <= 0) return null;
    const [client] = await db.select({
      empresaId: clientsTable.empresaId,
      locationId: clientsTable.locationId,
    }).from(clientsTable).where(eq(clientsTable.id, row.pacienteId)).limit(1);
    if (!client || client.empresaId !== empresaId || client.locationId !== locationId) return null;
    try {
      const bytes = await new ObjectStorageService().readPrivateObject(row.pdfStorageKey);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const expectedHash = row.hashAssinado.replace(/^sha256:/i, "").toLowerCase();
      if (!bytes.length || bytes.subarray(0, 5).toString("ascii") !== "%PDF-" || sha256 !== expectedHash) return null;
      return {
        id: row.id,
        clientId: row.pacienteId,
        professionalId: null,
        status: "emitted",
        signatureStatus: "signed",
        issuedAt: issuedDate(row.concluidoEm),
        pdfData: bytes.toString("base64"),
        fileName: `documento-assinado-${row.id}.pdf`,
        label: row.titulo || row.tipoDoc,
        empresaId,
        locationId,
      };
    } catch {
      return null;
    }
  }
  if (type === "prescricao") {
    const [recipe] = await db.select().from(recipesTable)
      .where(eq(recipesTable.id, documentId)).limit(1);
    if (!recipe) return null;
    const [prescription] = await db.select().from(prescriptionsTable)
      .where(eq(prescriptionsTable.id, recipe.prescriptionId)).limit(1);
    if (!prescription) return null;
    const scope = await readIssueScope("prescriptions", prescription.id);
    return {
      id: recipe.id,
      clientId: prescription.clientId,
      professionalId: prescription.professionalId,
      prescriptionId: recipe.prescriptionId,
      status: prescription.status,
      signatureStatus: prescription.signatureStatus,
      issuedAt: issuedDate(prescription.emittedAt),
      pdfData: recipe.pdfData,
      fileName: recipe.fileName,
      label: recipe.title || "Receita",
      empresaId: scope.empresaId,
      locationId: scope.locationId,
    };
  }
  if (type === "pedido_exames") {
    const [row] = await db.select().from(examRequestPdfsTable)
      .where(eq(examRequestPdfsTable.id, documentId)).limit(1);
    if (!row) return null;
    const scope = await readIssueScope("exam_request_pdfs", row.id);
    return {
      id: row.id, clientId: row.clientId, professionalId: row.professionalId,
      status: "emitted", signatureStatus: "not_required", issuedAt: issuedDate(row.createdAt),
      pdfData: row.pdfData, fileName: row.fileName,
      label: `Pedido de exames — ${row.fileName}`,
      empresaId: scope.empresaId,
      locationId: scope.locationId,
    };
  }
  if (type === "atestado") {
    const [row] = await db.select().from(medicalCertificatesTable)
      .where(eq(medicalCertificatesTable.id, documentId)).limit(1);
    if (!row) return null;
    const scope = await readIssueScope("medical_certificates", row.id);
    return {
      id: row.id, clientId: row.clientId, professionalId: row.professionalId, status: row.status,
      signatureStatus: "not_required", issuedAt: issuedDate(row.emittedAt),
      pdfData: row.pdfData, fileName: row.fileName,
      label: `Atestado${row.tipo ? ` — ${row.tipo}` : ""}`,
      empresaId: scope.empresaId,
      locationId: scope.locationId,
    };
  }
  const [row] = await db.select().from(referralsTable)
    .where(eq(referralsTable.id, documentId)).limit(1);
  if (!row) return null;
  const scope = await readIssueScope("referrals", row.id);
  return {
    id: row.id, clientId: row.clientId, professionalId: row.professionalId, status: row.status,
    signatureStatus: "not_required", issuedAt: issuedDate(row.emittedAt),
    pdfData: row.pdfData, fileName: row.fileName,
    label: `Encaminhamento${row.especialidadeDestino ? ` — ${row.especialidadeDestino}` : ""}`,
    empresaId: scope.empresaId,
    locationId: scope.locationId,
  };
}
