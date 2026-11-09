/**
 * Desafio presencial (K8c): duas metades de 3 caracteres, sorteadas, tiradas SÓ de dados
 * do cadastro do cliente. Decisão do CEO (09/11/2026, opção B). Prova FRACA por natureza:
 * a enfermeira enxerga esses dados; por isso o resultado é sempre marcado "por dados do
 * cadastro" e o e-mail de confirmação continua obrigatório.
 *
 * O navegador recebe só o RÓTULO de cada metade. O valor esperado é calculado no
 * servidor, na hora de validar, a partir do cadastro (nada é gravado).
 */
import { randomInt, timingSafeEqual } from "node:crypto";

export type ChallengeFieldKey = "cpf_ult3" | "cpf_pri3" | "end_num3" | "nasc_ano3" | "rua_3letras";

export interface ChallengeClientData {
  cpf?: string | null;
  birthDate?: string | null;
  address?: string | null;
}

interface FieldDef {
  key: ChallengeFieldKey;
  label: string;
  extract: (client: ChallengeClientData) => string | null;
}

export const MAX_ROUNDS = 3; // rodada inicial + 2 novos sorteios (decisão do CEO, opção C)
export const ATTEMPTS_PER_ROUND = 3;

export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function digits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

const STREET_TYPE = "(?:rua|r\\.|avenida|av\\.?|alameda|al\\.|travessa|tv\\.|rodovia|estrada|pra[cç]a|p[cç]a\\.?|largo)";
// "Rua das Flores, 123 - Centro": tipo + nome + vírgula + número. Fora desse formato o dado fica indisponível.
const ADDRESS_RE = new RegExp(`^\\s*${STREET_TYPE}\\s+([^,\\d]+?)\\s*,\\s*(\\d{1,6})\\b`, "i");

function parseAddress(address: string | null | undefined): { name: string; number: string } | null {
  const match = ADDRESS_RE.exec(address ?? "");
  if (!match) return null;
  return { name: match[1].trim(), number: match[2] };
}

function parseBirthYear(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  const iso = /^(\d{4})-\d{2}-\d{2}/.exec(text);
  if (iso) return iso[1];
  const br = /^\d{2}\/\d{2}\/(\d{4})$/.exec(text);
  if (br) return br[1];
  return null;
}

const FIELDS: FieldDef[] = [
  {
    key: "cpf_ult3",
    label: "3 últimos dígitos do CPF",
    extract: (c) => { const d = digits(c.cpf); return d.length === 11 ? d.slice(-3) : null; },
  },
  {
    key: "cpf_pri3",
    label: "3 primeiros dígitos do CPF",
    extract: (c) => { const d = digits(c.cpf); return d.length === 11 ? d.slice(0, 3) : null; },
  },
  {
    key: "end_num3",
    label: "Número do endereço, com 3 dígitos (complete com zero à esquerda: 11 vira 011)",
    extract: (c) => {
      const a = parseAddress(c.address);
      if (!a || a.number.length > 3) return null;
      return a.number.padStart(3, "0");
    },
  },
  {
    key: "nasc_ano3",
    label: "3 últimos dígitos do ano de nascimento",
    extract: (c) => { const y = parseBirthYear(c.birthDate); return y ? y.slice(-3) : null; },
  },
  {
    key: "rua_3letras",
    label: "3 primeiras letras do nome da rua (sem Rua, Avenida etc. e sem de, da, do)",
    extract: (c) => {
      const a = parseAddress(c.address);
      if (!a) return null;
      const words = stripAccents(a.name).replace(/[^A-Za-z\s]/g, " ").split(/\s+/).filter(Boolean);
      const meaningful = words.filter((w) => !/^(de|da|do|das|dos)$/i.test(w));
      const letters = (meaningful.join("")).toUpperCase();
      return letters.length >= 3 ? letters.slice(0, 3) : null;
    },
  },
];

export function fieldLabel(key: string): string | null {
  return FIELDS.find((f) => f.key === key)?.label ?? null;
}

/** Valor esperado de um campo (só no servidor). */
export function expectedValue(key: string, client: ChallengeClientData): string | null {
  return FIELDS.find((f) => f.key === key)?.extract(client) ?? null;
}

export function availableFields(client: ChallengeClientData): ChallengeFieldKey[] {
  return FIELDS.filter((f) => f.extract(client) !== null).map((f) => f.key);
}

export function pairSignature(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/**
 * Sorteia um par ORDENADO (metade 1, metade 2) que ainda não foi usado nesta visita.
 * Devolve null quando não há par novo possível (desafio trava).
 */
export function drawPair(
  client: ChallengeClientData,
  usedSignatures: string[],
  random: (maxExclusive: number) => number = (n) => randomInt(0, n),
): { a: ChallengeFieldKey; b: ChallengeFieldKey } | null {
  const available = availableFields(client);
  const candidates: Array<[ChallengeFieldKey, ChallengeFieldKey]> = [];
  for (let i = 0; i < available.length; i++) {
    for (let j = i + 1; j < available.length; j++) {
      if (!usedSignatures.includes(pairSignature(available[i], available[j]))) {
        candidates.push([available[i], available[j]]);
      }
    }
  }
  if (candidates.length === 0) return null;
  const [x, y] = candidates[random(candidates.length)];
  return random(2) === 0 ? { a: x, b: y } : { a: y, b: x };
}

/** Normaliza o que a enfermeira digitou: sem espaço, sem acento, maiúsculo. */
export function normalizeAnswer(value: unknown): string {
  return stripAccents(String(value ?? "")).replace(/\s+/g, "").toUpperCase();
}

export function answersMatch(
  fieldA: string,
  fieldB: string,
  halfA: unknown,
  halfB: unknown,
  client: ChallengeClientData,
): boolean {
  const ea = expectedValue(fieldA, client);
  const eb = expectedValue(fieldB, client);
  if (!ea || !eb) return false;
  const given = Buffer.from(normalizeAnswer(halfA) + "|" + normalizeAnswer(halfB));
  const expected = Buffer.from(`${ea.toUpperCase()}|${eb.toUpperCase()}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
