/**
 * Matriz de regras de identidade POR CLÍNICA (função pura, sem banco).
 * A clínica ajusta dentro de limites globais de segurança que nenhuma configuração desliga.
 * Spec: specs/depuracao-exames-identidade-regras-configuraveis.md
 */

/** Tipos de divergência de grafia que o motor sabe nomear. "alias_conhecido" = apelido já verificado por CPF. */
export const VARIANT_KINDS = [
  "fonetica",
  "grafia",
  "inicial",
  "abreviacao",
  "ordem",
  "token_dividido",
  "subconjunto",
  "alias_conhecido",
] as const;
export type VariantKind = (typeof VARIANT_KINDS)[number];

export const PARTIAL_POLICIES = ["quarentena", "aceitar_com_nascimento_igual", "aceitar"] as const;
export type PartialPolicy = (typeof PARTIAL_POLICIES)[number];

export interface IdentityRules {
  /** Aceita variante de grafia do nome quando o CPF confere (false = toda variante vai para revisão). */
  variantesComCpf: boolean;
  tiposDeVarianteAceitos: VariantKind[];
  /** Tolerância de edição por palavra; teto global 2. */
  distanciaMaximaEdicao: 0 | 1 | 2;
  /** Nome só parcialmente compatível (ex.: nome do meio diferente) com CPF igual. */
  nomeParcialComCpf: PartialPolicy;
  /** Mais rígido: o auto-aceite com variante exige também nascimento igual. */
  exigirNascimentoParaAutoAceite: boolean;
  /** Sem CPF no laudo, variante de nome com nascimento igual vira análise PRELIMINAR (nunca prontuário). */
  permitirPreliminarSemCpf: boolean;
}

export const DEFAULT_RULES: IdentityRules = {
  variantesComCpf: true,
  tiposDeVarianteAceitos: [...VARIANT_KINDS],
  distanciaMaximaEdicao: 2,
  nomeParcialComCpf: "aceitar_com_nascimento_igual",
  exigirNascimentoParaAutoAceite: false,
  permitirPreliminarSemCpf: true,
};

/** Modo mais rígido possível: usado quando a configuração gravada da clínica não pode ser lida. */
export const STRICTEST_RULES: IdentityRules = {
  variantesComCpf: false,
  tiposDeVarianteAceitos: [],
  distanciaMaximaEdicao: 0,
  nomeParcialComCpf: "quarentena",
  exigirNascimentoParaAutoAceite: true,
  permitirPreliminarSemCpf: false,
};

/** Limites que NENHUMA clínica consegue alterar (mostrados na tela de regras). */
export const GLOBAL_SAFETY_LIMITS: readonly string[] = [
  "Variante ou nome parcial só é aceito com CPF válido e igual ao cadastro; nome nunca prova identidade sozinho.",
  "Sem CPF comparável, só nome exato com nascimento igual entra no prontuário; variante vira análise preliminar.",
  "CPF válido e diferente, CPF inválido ou ilegível, nascimento diferente ou nome sem nenhuma palavra em comum vão para quarentena.",
  "Dois CPFs válidos distintos no texto do laudo (sinal de dois pacientes) vão para quarentena.",
  "Data de coleta anterior ao nascimento cadastrado vai para quarentena.",
  "Tolerância de edição por palavra: no máximo 2 caracteres.",
  "Toda decisão automática grava registro imutável com a trilha e a versão das regras.",
];

const ALLOWED_KEYS = new Set(Object.keys(DEFAULT_RULES));

export type RuleValidation = { ok: true; config: IdentityRules } | { ok: false; errors: string[] };

/** Valida e completa (sobre o padrão global). Recusa chave desconhecida e valor fora do limite: nunca ajusta em silêncio. */
export function normalizeRuleConfig(input: unknown): RuleValidation {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["A configuração deve ser um objeto."] };
  }
  const raw = input as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_KEYS.has(key)) errors.push(`Regra desconhecida: ${key}.`);
  }
  const config: IdentityRules = { ...DEFAULT_RULES, tiposDeVarianteAceitos: [...DEFAULT_RULES.tiposDeVarianteAceitos] };

  const bool = (key: "variantesComCpf" | "exigirNascimentoParaAutoAceite" | "permitirPreliminarSemCpf") => {
    if (raw[key] === undefined) return;
    if (typeof raw[key] !== "boolean") errors.push(`${key} deve ser verdadeiro ou falso.`);
    else config[key] = raw[key] as boolean;
  };
  bool("variantesComCpf");
  bool("exigirNascimentoParaAutoAceite");
  bool("permitirPreliminarSemCpf");

  if (raw.tiposDeVarianteAceitos !== undefined) {
    const v = raw.tiposDeVarianteAceitos;
    if (!Array.isArray(v) || v.some((k) => typeof k !== "string" || !(VARIANT_KINDS as readonly string[]).includes(k))) {
      errors.push(`tiposDeVarianteAceitos deve ser uma lista com valores de: ${VARIANT_KINDS.join(", ")}.`);
    } else {
      config.tiposDeVarianteAceitos = [...new Set(v as VariantKind[])];
    }
  }
  if (raw.distanciaMaximaEdicao !== undefined) {
    const d = raw.distanciaMaximaEdicao;
    if (d !== 0 && d !== 1 && d !== 2) errors.push("distanciaMaximaEdicao deve ser 0, 1 ou 2 (limite global: 2).");
    else config.distanciaMaximaEdicao = d;
  }
  if (raw.nomeParcialComCpf !== undefined) {
    const p = raw.nomeParcialComCpf;
    if (typeof p !== "string" || !(PARTIAL_POLICIES as readonly string[]).includes(p)) {
      errors.push(`nomeParcialComCpf deve ser um de: ${PARTIAL_POLICIES.join(", ")}.`);
    } else config.nomeParcialComCpf = p as PartialPolicy;
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, config };
}
