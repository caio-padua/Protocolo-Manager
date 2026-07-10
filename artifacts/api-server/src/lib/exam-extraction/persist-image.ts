import {
  db,
  examDocumentsTable,
  examImagePanelsTable,
  examImagePanelFieldsTable,
  examImageFindingsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { normalizeAnalyteName, brDateToIso } from "./persist";
import type { ExtractedImageReport } from "./schema-image";

// ============================================================================
// Persistencia da trilha de IMAGEM. Grava 1 documento -> N paineis -> N achados.
// Zero perda (regra de ouro do CEO): o JSON cru completo fica em rawJson do
// documento; alem disso auto-provisiona painel/campo quando ainda nao existem,
// para o achado ficar consultavel (a chave estrangeira exige campo real).
// ============================================================================

const SECTOR_BY_TYPE: Record<string, string> = {
  usg: "ultrassom",
  rmn: "ressonancia",
  tc: "tomografia",
  densitometria: "densitometria",
  rx: "radiografia",
};

/** minusculo, sem acento, sem pontuacao, espacos -> "-". Base de code/fieldKey. */
function slug(raw: string): string {
  const base = normalizeAnalyteName(raw).replace(/\s+/g, "-");
  return base || "outro";
}

export interface PersistImageSummary {
  panelsTouched: number;
  findingsInserted: number;
  exams: number;
}

/** Garante o painel (idempotente por code). */
async function ensurePanel(code: string, displayName: string, sector: string): Promise<void> {
  await db
    .insert(examImagePanelsTable)
    .values({ code, displayName, sector, synonyms: [], active: true })
    .onConflictDoNothing();
}

/** Garante o campo do painel (idempotente por ux_exam_image_panel_field). */
async function ensureField(panelCode: string, fieldKey: string, label: string): Promise<void> {
  await db
    .insert(examImagePanelFieldsTable)
    .values({ panelCode, fieldKey, label, valueType: "text", aliases: [], active: true })
    .onConflictDoNothing();
}

export async function persistExtractedImage(
  documentId: number,
  clientId: number,
  report: ExtractedImageReport,
): Promise<PersistImageSummary> {
  const summary: PersistImageSummary = { panelsTouched: 0, findingsInserted: 0, exams: 0 };

  for (const exam of report.exams) {
    summary.exams++;
    const type = (exam.examType || "outro").toLowerCase();
    const sector = exam.sector || SECTOR_BY_TYPE[type] || "outro";
    const displayName = exam.title || exam.examType || "Exame de imagem";
    const panelCode = slug(exam.title || exam.examType || "outro");
    const collectionIso = brDateToIso(exam.collectionDate);
    const lab = exam.labName ?? null;

    await ensurePanel(panelCode, displayName, sector);
    summary.panelsTouched++;

    // Monta a lista de achados a gravar: conclusao + comparativo + achados descritivos.
    const rows: Array<{ fieldKey: string; label: string; level: string | null; value: string }> = [];
    if (exam.conclusion) {
      rows.push({ fieldKey: "conclusao", label: "Conclusão / Impressão", level: null, value: exam.conclusion });
    }
    if (exam.comparativo) {
      rows.push({ fieldKey: "comparativo", label: "Comparativo (exame anterior)", level: null, value: exam.comparativo });
    }
    for (const f of exam.findings) {
      if (!f.value) continue;
      rows.push({
        fieldKey: slug(f.field),
        label: f.field,
        level: f.level ?? null,
        value: f.value,
      });
    }

    for (const r of rows) {
      await ensureField(panelCode, r.fieldKey, r.label);
      const inserted = await db
        .insert(examImageFindingsTable)
        .values({
          examDocumentId: documentId,
          clientId,
          panelCode,
          fieldKey: r.fieldKey,
          level: r.level,
          value: r.value,
          rawValue: r.value,
          status: "extraido",
          confidence: String(report.confidence),
          collectionDate: collectionIso,
          labName: lab,
        })
        .onConflictDoNothing()
        .returning({ id: examImageFindingsTable.id });
      if (inserted.length > 0) summary.findingsInserted++;
    }
  }

  return summary;
}

/** Marca o documento de imagem como processado (recebido) com o JSON cru completo. */
export async function finalizeImageDocument(
  documentId: number,
  report: ExtractedImageReport,
  modelUsed: string,
): Promise<void> {
  const firstDate = report.exams.map((e) => brDateToIso(e.collectionDate)).find(Boolean) ?? null;
  const firstLab = report.exams.map((e) => e.labName).find(Boolean) ?? null;
  await db
    .update(examDocumentsTable)
    .set({
      labName: firstLab,
      collectionDate: firstDate,
      confidence: String(report.confidence),
      modelUsed,
      rawJson: report as unknown as Record<string, unknown>,
      status: "recebido",
      examKind: "imagem",
    })
    .where(eq(examDocumentsTable.id, documentId));
}
