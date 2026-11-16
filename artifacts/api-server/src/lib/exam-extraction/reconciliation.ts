import type { ExtractedExam, ExtractedAnalyte } from "./schema.js";

export interface ExtractionCandidate {
  provider: "gemini" | "openai" | "claude" | string;
  data: ExtractedExam;
}

export interface ExtractionConflict {
  field: string;
  candidates: Array<{ provider: string; value: string }>;
}

export interface ReconciledExamCandidates {
  provisional: ExtractedExam | null;
  conflicts: ExtractionConflict[];
}

function normalizeName(name: string): string {
  return name.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function distinctCandidates(
  candidates: Array<{ provider: string; value: string | null }>,
): Array<{ provider: string; value: string }> {
  const seen = new Set<string>();
  const result: Array<{ provider: string; value: string }> = [];
  for (const candidate of candidates) {
    if (candidate.value === null || candidate.value.trim() === "") continue;
    const key = candidate.value.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ provider: candidate.provider, value: key });
  }
  return result;
}

function firstNonEmpty(values: Array<string | null>): string | null {
  return values.find((value) => value !== null && value.trim() !== "") ?? null;
}

function analyteConflicts(candidates: ExtractionCandidate[]): ExtractionConflict[] {
  const groups = new Map<string, Array<{ provider: string; analyte: ExtractedAnalyte }>>();
  for (const candidate of candidates) {
    for (const analyte of candidate.data.analytes) {
      const key = normalizeName(analyte.name);
      if (!key) continue;
      const group = groups.get(key) ?? [];
      group.push({ provider: candidate.provider, analyte });
      groups.set(key, group);
    }
  }

  const conflicts: ExtractionConflict[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    for (const field of ["value", "unit", "referenceRange"] as const) {
      const values = distinctCandidates(group.map(({ provider, analyte }) => ({
        provider,
        value: analyte[field],
      })));
      if (values.length > 1) {
        conflicts.push({ field: `analito:${key}:${field}`, candidates: values });
      }
    }
  }
  return conflicts;
}

/**
 * Compara saídas independentes sem escolher um valor em caso de divergência.
 * A primeira saída é apenas provisória; conflitos precisam de revisão humana.
 * O chamador decide quando conectar este auxiliar ao pipeline clínico.
 */
export function reconcileExamCandidates(
  candidates: ExtractionCandidate[],
): ReconciledExamCandidates {
  const first = candidates[0]?.data;
  if (!first) return { provisional: null, conflicts: [] };

  const conflicts: ExtractionConflict[] = [];
  const metadataFields = [
    ["collectionDate", (data: ExtractedExam) => data.collectionDate],
    ["labName", (data: ExtractedExam) => data.labName],
    ["patient.name", (data: ExtractedExam) => data.patient.name],
    ["patient.cpf", (data: ExtractedExam) => data.patient.cpf],
    ["patient.birthDate", (data: ExtractedExam) => data.patient.birthDate],
  ] as const;

  for (const [field, read] of metadataFields) {
    const values = distinctCandidates(candidates.map((candidate) => ({
      provider: candidate.provider,
      value: read(candidate.data),
    })));
    if (values.length > 1) conflicts.push({ field, candidates: values });
  }

  const analytesByName = new Map<string, ExtractedAnalyte>();
  for (const candidate of candidates) {
    for (const analyte of candidate.data.analytes) {
      const key = normalizeName(analyte.name);
      if (key && !analytesByName.has(key)) analytesByName.set(key, analyte);
    }
  }

  const provisional: ExtractedExam = {
    ...first,
    patient: {
      name: firstNonEmpty(candidates.map(({ data }) => data.patient.name)),
      cpf: firstNonEmpty(candidates.map(({ data }) => data.patient.cpf)),
      birthDate: firstNonEmpty(candidates.map(({ data }) => data.patient.birthDate)),
    },
    collectionDate: firstNonEmpty(candidates.map(({ data }) => data.collectionDate)),
    labName: firstNonEmpty(candidates.map(({ data }) => data.labName)),
    confidence: Math.min(...candidates.map(({ data }) => data.confidence)),
    analytes: [...analytesByName.values()],
  };
  return { provisional, conflicts: [...conflicts, ...analyteConflicts(candidates)] };
}
