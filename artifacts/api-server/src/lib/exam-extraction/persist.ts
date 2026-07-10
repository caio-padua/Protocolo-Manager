import {
  db,
  examDocumentsTable,
  examResultsTable,
  examAnalyteCatalogTable,
  examAnalyteRangesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import type { ExtractedExam } from "./schema";

// ============================================================================
// Trajetoria do Exame Uploadado — persistencia (Onda 3 da spec)
// Grava 1 documento + N resultados (linha por analito por data por laboratorio,
// incluindo o historico que o proprio laudo traz — "almoco gratis").
// ============================================================================

/** "18,4" -> 18.4 | "210.000" -> 210000 | "5,90" -> 5.9. Nao numerico -> null. */
export function parseBrazilNumber(raw: string | null): number | null {
  if (!raw) return null;
  let s = raw.trim().replace(/\s/g, "");
  // remove sinais de comparacao impressos ("<0,5")
  s = s.replace(/^[<>≤≥~]+/, "");
  if (!/^[\d.,-]+$/.test(s)) return null;
  // ponto de milhar: remove pontos seguidos de exatamente 3 digitos
  s = s.replace(/\.(?=\d{3}(\D|$))/g, "");
  s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "13,0 a 17,0" | "13 - 17" | "inferior a 5" | "ate 200" | "> 40" -> {low, high} */
export function parseReferenceRange(raw: string | null): {
  low: number | null;
  high: number | null;
} {
  if (!raw) return { low: null, high: null };
  const t = raw.toLowerCase();
  const nums = t.match(/\d+(?:[.,]\d+)?(?:\.\d{3})*/g)?.map((x) => parseBrazilNumber(x)) ?? [];
  const first = nums[0] ?? null;
  const second = nums[1] ?? null;
  if (/inferior|menor|ate|até|<|maxim/i.test(t) && nums.length === 1) {
    return { low: null, high: first };
  }
  if (/superior|maior|acima|>|minim/i.test(t) && nums.length === 1) {
    return { low: first, high: null };
  }
  if (nums.length >= 2) return { low: first, high: second };
  return { low: null, high: null };
}

/** minusculo, sem acento, sem pontuacao — base do casamento por apelido. */
export function normalizeAnalyteName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** dentro | acima | abaixo | null (sem referencia) */
export function classifyByRef(
  value: number | null,
  low: number | null,
  high: number | null,
): string | null {
  if (value === null) return null;
  if (low !== null && value < low) return "abaixo";
  if (high !== null && value > high) return "acima";
  if (low === null && high === null) return null;
  return "dentro";
}

/** "11/06/2026" -> "2026-06-11" (formato de coluna date). Invalida -> null. */
export function brDateToIso(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = Number(dd);
  const mo = Number(mm);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  return `${yyyy}-${mm}-${dd}`;
}

interface CatalogEntry {
  code: string;
  displayName: string;
  keys: Set<string>;
}

async function loadCatalog(): Promise<CatalogEntry[]> {
  const rows = await db
    .select()
    .from(examAnalyteCatalogTable)
    .where(eq(examAnalyteCatalogTable.active, true));
  return rows.map((r) => {
    const keys = new Set<string>([normalizeAnalyteName(r.displayName)]);
    for (const s of r.synonyms ?? []) keys.add(normalizeAnalyteName(s));
    return { code: r.code, displayName: r.displayName, keys };
  });
}

function matchAnalyte(catalog: CatalogEntry[], rawName: string): string | null {
  const key = normalizeAnalyteName(rawName);
  for (const entry of catalog) {
    if (entry.keys.has(key)) return entry.code;
  }
  return null;
}

export interface PersistExamInput {
  documentId: number;
  clientId: number;
  extracted: ExtractedExam;
}

export interface PersistExamSummary {
  resultsInserted: number;
  historyInserted: number;
  matched: number;
  unmatched: number;
}

/**
 * Grava os resultados de um documento ja inserido. Idempotente: o indice unico
 * (cliente + data + laboratorio + nome cru) segura repeticao quando os campos
 * estao presentes; o guard principal de duplicidade e o hash do documento.
 */
export async function persistExtractedResults(
  input: PersistExamInput,
): Promise<PersistExamSummary> {
  const { documentId, clientId, extracted } = input;
  const catalog = await loadCatalog();
  const collectionIso = brDateToIso(extracted.collectionDate);
  const lab = extracted.labName ?? null;

  const summary: PersistExamSummary = {
    resultsInserted: 0,
    historyInserted: 0,
    matched: 0,
    unmatched: 0,
  };

  for (const analyte of extracted.analytes) {
    const code = matchAnalyte(catalog, analyte.name);
    if (code) summary.matched++;
    else summary.unmatched++;

    const value = parseBrazilNumber(analyte.value);
    const ref = parseReferenceRange(analyte.referenceRange);
    const status = classifyByRef(value, ref.low, ref.high);

    // Faixas internas (Subcadastro) tem prioridade sobre a referencia do laudo
    // quando existirem para o analito casado.
    let finalStatus: string | null = status;
    if (code && value !== null) {
      const ranges = await db
        .select()
        .from(examAnalyteRangesTable)
        .where(eq(examAnalyteRangesTable.analyteCode, code));
      const faixa = ranges.find((r) => {
        const lo = r.low === null ? null : Number(r.low);
        const hi = r.high === null ? null : Number(r.high);
        return (lo === null || value >= lo) && (hi === null || value <= hi);
      });
      if (faixa) finalStatus = faixa.faixaName;
    }

    const inserted = await db
      .insert(examResultsTable)
      .values({
        examDocumentId: documentId,
        clientId,
        analyteCode: code,
        analyteNameRaw: analyte.name,
        valueRaw: analyte.value,
        unitRaw: analyte.unit,
        valueCanonical: value === null ? null : String(value),
        unitCanonical: analyte.unit,
        refLow: ref.low === null ? null : String(ref.low),
        refHigh: ref.high === null ? null : String(ref.high),
        status: finalStatus,
        collectionDate: collectionIso,
        labName: lab,
      })
      .onConflictDoNothing()
      .returning({ id: examResultsTable.id });
    if (inserted.length > 0) summary.resultsInserted++;

    // "Almoco gratis": cada ponto historico do proprio laudo vira linha propria
    for (const point of analyte.history) {
      const histIso = brDateToIso(point.date);
      if (!histIso || histIso === collectionIso) continue;
      const histValue = parseBrazilNumber(point.value);
      const histStatus = classifyByRef(histValue, ref.low, ref.high);
      const histInserted = await db
        .insert(examResultsTable)
        .values({
          examDocumentId: documentId,
          clientId,
          analyteCode: code,
          analyteNameRaw: analyte.name,
          valueRaw: point.value,
          unitRaw: point.unit ?? analyte.unit,
          valueCanonical: histValue === null ? null : String(histValue),
          unitCanonical: point.unit ?? analyte.unit,
          refLow: ref.low === null ? null : String(ref.low),
          refHigh: ref.high === null ? null : String(ref.high),
          status: histStatus,
          collectionDate: histIso,
          labName: lab,
        })
        .onConflictDoNothing()
        .returning({ id: examResultsTable.id });
      if (histInserted.length > 0) summary.historyInserted++;
    }
  }

  return summary;
}

/** Marca o documento como processado (recebido) com metadados da extracao. */
export async function finalizeDocument(
  documentId: number,
  extracted: ExtractedExam,
  modelUsed: string,
): Promise<void> {
  await db
    .update(examDocumentsTable)
    .set({
      labName: extracted.labName,
      collectionDate: brDateToIso(extracted.collectionDate),
      confidence: String(extracted.confidence),
      modelUsed,
      rawJson: extracted as unknown as Record<string, unknown>,
      status: "recebido",
    })
    .where(eq(examDocumentsTable.id, documentId));
}

export async function markDocumentError(documentId: number, message: string): Promise<void> {
  await db
    .update(examDocumentsTable)
    .set({ status: "erro", rawJson: { error: message } })
    .where(eq(examDocumentsTable.id, documentId));
}
