import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  examRequestPdfsTable,
  medicalCertificatesTable,
  prescriptionsTable,
  recipesTable,
  referralsTable,
} from "@workspace/db";

export type ClinicalDocumentType = "prescricao" | "pedido_exames" | "atestado" | "encaminhamento";

export const CLINICAL_DOCUMENT_SHARE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

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

export async function getIssuedDocument(type: ClinicalDocumentType, documentId: number) {
  if (type === "prescricao") {
    const [recipe] = await db.select().from(recipesTable)
      .where(eq(recipesTable.id, documentId)).limit(1);
    if (!recipe) return null;
    const [prescription] = await db.select().from(prescriptionsTable)
      .where(eq(prescriptionsTable.id, recipe.prescriptionId)).limit(1);
    if (!prescription) return null;
    return {
      id: recipe.id,
      clientId: prescription.clientId,
      professionalId: prescription.professionalId,
      prescriptionId: recipe.prescriptionId,
      status: prescription.status,
      pdfData: recipe.pdfData,
      fileName: recipe.fileName,
      label: recipe.title || "Receita",
      empresaId: prescription.empresaId,
    };
  }
  if (type === "pedido_exames") {
    const [row] = await db.select().from(examRequestPdfsTable)
      .where(eq(examRequestPdfsTable.id, documentId)).limit(1);
    if (!row) return null;
    return {
      id: row.id, clientId: row.clientId, professionalId: row.professionalId,
      status: "emitted", pdfData: row.pdfData, fileName: row.fileName,
      label: `Pedido de exames — ${row.fileName}`,
      empresaId: null,
    };
  }
  if (type === "atestado") {
    const [row] = await db.select().from(medicalCertificatesTable)
      .where(eq(medicalCertificatesTable.id, documentId)).limit(1);
    if (!row) return null;
    return {
      id: row.id, clientId: row.clientId, professionalId: row.professionalId, status: row.status,
      pdfData: row.pdfData, fileName: row.fileName,
      label: `Atestado${row.tipo ? ` — ${row.tipo}` : ""}`,
      empresaId: null,
    };
  }
  const [row] = await db.select().from(referralsTable)
    .where(eq(referralsTable.id, documentId)).limit(1);
  if (!row) return null;
  return {
    id: row.id, clientId: row.clientId, professionalId: row.professionalId, status: row.status,
    pdfData: row.pdfData, fileName: row.fileName,
    label: `Encaminhamento${row.especialidadeDestino ? ` — ${row.especialidadeDestino}` : ""}`,
    empresaId: null,
  };
}
