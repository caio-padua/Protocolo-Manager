import { parseBirthDate, type FieldResult } from "./identity-check";

export type PortalIdentityStatus = FieldResult | "nao_avaliado";

export type PortalIdentityField = {
  valor: string | null;
  status: PortalIdentityStatus;
};

export type PortalIdentityIssue = {
  nome: PortalIdentityField;
  cpf: PortalIdentityField;
  dataNascimento: PortalIdentityField;
};

const FIELD_RESULTS: readonly FieldResult[] = ["igual", "variante", "parcial", "diferente", "ausente", "invalido"];
const PARTICULAS = new Set(["da", "das", "de", "do", "dos", "e", "del", "della", "di", "du", "la", "van", "von"]);

function recordOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function textOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  return text.length > 0 && text.length <= 160 ? text : null;
}

function particleKey(value: string): string {
  return value.toLocaleLowerCase("pt-BR").replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
}

function initialOf(value: string): string {
  return value.split("-").filter(Boolean)
    .map((part) => `${Array.from(part)[0]?.toLocaleUpperCase("pt-BR") ?? ""}.`)
    .filter(Boolean)
    .join("-");
}

/**
 * Mostra o primeiro nome e os dois últimos componentes do sobrenome por extenso.
 * Os nomes entre eles viram iniciais; partículas do sobrenome permanecem completas.
 * Esta é somente uma regra de apresentação e não participa da comparação de identidade.
 */
export function formatPortalIdentityName(raw: unknown): string | null {
  const text = textOf(raw);
  if (!text) return null;
  const parts = text.split(" ");
  if (parts.length <= 3) return text;

  const nonParticles = parts
    .map((part, index) => ({ part, index }))
    .filter(({ part, index }) => index > 0 && !PARTICULAS.has(particleKey(part)));
  if (nonParticles.length <= 2) return text;

  let surnameStart = nonParticles[nonParticles.length - 2].index;
  while (surnameStart > 1 && PARTICULAS.has(particleKey(parts[surnameStart - 1]))) surnameStart--;

  const firstName = parts[0];
  const middleInitials = parts.slice(1, surnameStart).map(initialOf);
  const surname = parts.slice(surnameStart);
  return [firstName, ...middleInitials, ...surname].filter(Boolean).join(" ");
}

/** Retorna os quatro primeiros dígitos e mascara todas as posições restantes. */
export function formatPortalIdentityCpf(raw: unknown): string | null {
  const text = textOf(raw);
  if (!text) return null;
  const digits = text.replace(/\D/g, "");
  if (!digits) return null;
  const firstFour = digits.slice(0, 4).padEnd(4, "•");
  return `${firstFour.slice(0, 3)}.${firstFour[3]}••.•••-••`;
}

/** Usa a mesma validação de datas do motor de identidade; só muda a apresentação. */
export function formatPortalIdentityBirthDate(raw: unknown): string | null {
  const text = textOf(raw);
  if (!text) return null;
  const iso = parseBirthDate(text);
  if (!iso) return null;
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function statusOf(value: unknown): PortalIdentityStatus {
  return typeof value === "string" && FIELD_RESULTS.includes(value as FieldResult)
    ? value as FieldResult
    : "nao_avaliado";
}

/**
 * Cria um contrato mínimo para o portal: nunca copia o JSON completo do exame,
 * os motivos internos, a trilha de auditoria ou valores clínicos.
 */
export function buildPortalIdentityIssue(fieldResults: unknown, identityData: unknown): PortalIdentityIssue {
  const fields = recordOf(fieldResults);
  const identity = recordOf(identityData);
  return {
    nome: { valor: formatPortalIdentityName(identity.name), status: statusOf(fields.name) },
    cpf: { valor: formatPortalIdentityCpf(identity.cpf), status: statusOf(fields.cpf) },
    dataNascimento: { valor: formatPortalIdentityBirthDate(identity.birthDate), status: statusOf(fields.birthDate) },
  };
}
