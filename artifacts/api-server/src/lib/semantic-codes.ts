export const SEMANTIC_RELATIONS = {
  propria: { code: "PROU", label: "Própria do grupo" },
  filial_interna: { code: "FILU", label: "Filial interna do grupo" },
  licenciada_direta: { code: "LICD", label: "Licenciada direta" },
  licenciada_por_clinica: { code: "LICI", label: "Licenciada por clínica" },
  independente: { code: "INDE", label: "Empresa independente" },
  parceira: { code: "PARC", label: "Parceira" },
} as const;

export type SemanticRelation = keyof typeof SEMANTIC_RELATIONS;

const GENERIC_NAME_WORDS = new Set([
  "CLINICA",
  "CLINICO",
  "CENTRO",
  "CONSULTORIO",
  "EMPRESA",
  "GRUPO",
  "HOSPITAL",
  "INSTITUTO",
  "SERVICO",
  "SERVICOS",
]);

export function isSemanticRelation(value: unknown): value is SemanticRelation {
  return typeof value === "string" && value in SEMANTIC_RELATIONS;
}

export function deriveSemanticBase(companyName: string): string | null {
  const words = companyName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  const meaningful = words.filter((word) => !GENERIC_NAME_WORDS.has(word));
  const source = meaningful.length > 0 ? meaningful : words;
  const letters = source.join("").replace(/[^A-Z]/g, "");
  return letters.length >= 4 ? letters.slice(0, 4) : null;
}

export function normalizeCnpj(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isValidCnpj(raw: string): boolean {
  const cnpj = normalizeCnpj(raw);
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;

  const calculateDigit = (digits: string, weights: number[]): number => {
    const sum = [...digits].reduce((total, digit, index) => {
      return total + Number(digit) * weights[index];
    }, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const first = calculateDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calculateDigit(cnpj.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${first}${second}`);
}

export function formatSemanticCode(input: {
  base: string;
  relation: SemanticRelation;
  cnpj: string;
  sequence: number;
}): string | null {
  const cnpj = normalizeCnpj(input.cnpj);
  if (!/^[A-Z]{4}$/.test(input.base) || !isValidCnpj(cnpj)) return null;
  if (!Number.isInteger(input.sequence) || input.sequence < 1 || input.sequence > 9999) return null;
  const relationCode = SEMANTIC_RELATIONS[input.relation].code;
  return `${input.base}.${relationCode}.${cnpj.slice(0, 4)}.${String(input.sequence).padStart(4, "0")}`;
}
