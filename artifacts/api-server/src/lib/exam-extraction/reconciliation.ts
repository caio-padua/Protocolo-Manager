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

// ── Composição segura de várias leituras (SPEC 1 do PAXTER Loop) ──────────────────────
// Diferente de reconcileExamCandidates (mantida intacta), aqui NENHUMA leitura é escolhida
// quando duas IAs discordam: o campo conflitante fica vazio (data, laboratório, paciente) ou o
// analito inteiro sai do resultado e vai para a lista de revisão. O que só UMA IA encontrou
// (analito com unidade, data, laboratório) é preservado, com a fonte registrada.

export interface ComposedConflict {
  field: string;
  candidates: Array<{ provider: string; value: string }>;
}

export interface ComposedExam {
  exam: ExtractedExam | null;
  conflicts: ComposedConflict[];
  /** Analitos retirados do resultado por divergência de valor ou unidade; ficam só na trilha. */
  excludedAnalytes: Array<{ key: string; name: string; reasons: string[] }>;
  /** Campo ou analito -> IAs que sustentam o valor usado. */
  sources: Record<string, string[]>;
  /** Confiança global informada por cada IA (null quando não informada). */
  confidences: Record<string, number | null>;
  /** Verdadeiro se paciente (nome, CPF, nascimento) divergiu: o porteiro de identidade deve reter. */
  patientConflict: boolean;
}

const norm = {
  text: (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase(),
  unit: (v: string) => v.normalize("NFC").replace(/\s+/g, "").toLowerCase(),
  date: (v: string) => v.trim(),
};

function distinctBy(
  items: Array<{ provider: string; value: string | null | undefined }>,
  key: (v: string) => string,
): Array<{ provider: string; value: string }> {
  const seen = new Map<string, { provider: string; value: string }>();
  for (const it of items) {
    if (it.value == null || it.value.trim() === "") continue;
    const k = key(it.value);
    if (!seen.has(k)) seen.set(k, { provider: it.provider, value: it.value.trim() });
  }
  return [...seen.values()];
}

function providersFor(
  items: Array<{ provider: string; value: string | null | undefined }>,
  key: (v: string) => string,
  chosen: string,
): string[] {
  return items.filter((i) => i.value != null && i.value.trim() !== "" && key(i.value) === key(chosen)).map((i) => i.provider);
}

export function composeExamCandidates(candidates: ExtractionCandidate[]): ComposedExam {
  const out: ComposedExam = { exam: null, conflicts: [], excludedAnalytes: [], sources: {}, confidences: {}, patientConflict: false };
  if (candidates.length === 0) return out;
  for (const c of candidates) out.confidences[c.provider] = Number.isFinite(c.data.confidence) ? c.data.confidence : null;

  const meta = (
    field: string,
    read: (d: ExtractedExam) => string | null,
    key: (v: string) => string,
  ): string | null => {
    const items = candidates.map((c) => ({ provider: c.provider, value: read(c.data) }));
    const distinct = distinctBy(items, key);
    if (distinct.length > 1) {
      out.conflicts.push({ field, candidates: distinct });
      return null;
    }
    if (distinct.length === 0) return null;
    out.sources[field] = providersFor(items, key, distinct[0].value);
    return distinct[0].value;
  };

  const patient = {
    name: meta("patient.name", (d) => d.patient.name, norm.text),
    cpf: meta("patient.cpf", (d) => d.patient.cpf, (v) => v.replace(/\D/g, "")),
    birthDate: meta("patient.birthDate", (d) => d.patient.birthDate, norm.date),
  };
  out.patientConflict = out.conflicts.some((c) => c.field.startsWith("patient."));
  const collectionDate = meta("collectionDate", (d) => d.collectionDate, norm.date);
  const labName = meta("labName", (d) => d.labName, norm.text);

  const groups = new Map<string, Array<{ provider: string; analyte: ExtractedAnalyte }>>();
  for (const c of candidates) {
    for (const a of c.data.analytes) {
      const k = normalizeName(a.name);
      if (!k) continue;
      groups.set(k, [...(groups.get(k) ?? []), { provider: c.provider, analyte: a }]);
    }
  }

  const analytes: ExtractedAnalyte[] = [];
  for (const [k, group] of groups) {
    const pick = (field: "value" | "unit" | "referenceRange" | "method", key: (v: string) => string) => {
      const items = group.map((g) => ({ provider: g.provider, value: g.analyte[field] }));
      const distinct = distinctBy(items, key);
      return { items, distinct };
    };
    const value = pick("value", norm.text);
    const unit = pick("unit", norm.unit);
    const range = pick("referenceRange", norm.text);
    const reasons: string[] = [];
    if (value.distinct.length > 1) {
      out.conflicts.push({ field: `analito:${k}:value`, candidates: value.distinct });
      reasons.push("valor");
    }
    if (unit.distinct.length > 1) {
      out.conflicts.push({ field: `analito:${k}:unit`, candidates: unit.distinct });
      reasons.push("unidade");
    }
    if (reasons.length > 0) {
      out.excludedAnalytes.push({ key: k, name: group[0].analyte.name, reasons });
      continue;
    }
    let referenceRange: string | null = null;
    if (range.distinct.length > 1) {
      out.conflicts.push({ field: `analito:${k}:referenceRange`, candidates: range.distinct });
    } else if (range.distinct.length === 1) {
      referenceRange = range.distinct[0].value;
    }
    const method = pick("method", norm.text).distinct[0]?.value ?? null;
    const history = group.find((g) => g.analyte.history.length > 0)?.analyte.history ?? [];
    analytes.push({
      name: group[0].analyte.name,
      value: value.distinct[0]?.value ?? null,
      unit: unit.distinct[0]?.value ?? null,
      referenceRange,
      method,
      history,
    });
    out.sources[`analito:${k}`] = [...new Set(group.map((g) => g.provider))];
  }

  const confs = candidates.map((c) => c.data.confidence).filter((n) => Number.isFinite(n));
  out.exam = {
    patient,
    collectionDate,
    labName,
    analytes,
    confidence: confs.length ? Math.min(...confs) : 0,
  };
  return out;
}
