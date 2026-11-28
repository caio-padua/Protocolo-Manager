/**
 * Motor de identidade do laudo (função pura, sem banco, sem rede).
 * Compara o que está IMPRESSO no laudo (CPF, nome, nascimento) com o cadastro do cliente.
 * Regras (specs/depuracao-exames-etapa-2-identidade-tenant.md, seção 3.1, e
 * specs/depuracao-exames-identidade-regras-configuraveis.md):
 *  - dado ausente nunca confirma;
 *  - nome sozinho nunca confirma, e não existe nota de semelhança que substitua o CPF;
 *  - CPF válido e igual é a âncora: pequenas diferenças de grafia do nome não bloqueiam;
 *  - CPF válido e diferente é contradição.
 */
import {
  DEFAULT_RULES,
  type IdentityRules,
  type VariantKind,
} from "./identity-rules.js";
import type { EvidenceResult } from "./identity-evidence.js";

export type { IdentityRules, VariantKind } from "./identity-rules.js";

export type FieldResult = "igual" | "variante" | "parcial" | "diferente" | "ausente" | "invalido";
export type IdentityVerdict = "confirmada" | "revisao" | "contradicao";
/**
 * incorporar            = identidade provada, sem divergência a registrar;
 * incorporar_com_alias  = provada pelo CPF, com variante de nome: grava apelido e trilha;
 * preliminar            = análise permitida sem entrar no prontuário (CPF ausente);
 * quarentena            = revisão humana.
 */
export type IdentityDecision = "incorporar" | "incorporar_com_alias" | "preliminar" | "quarentena";

export interface IdentityData {
  name?: string | null;
  cpf?: string | null;
  birthDate?: string | null;
}

export interface IdentityAssessment {
  verdict: IdentityVerdict;
  decision: IdentityDecision;
  fields: { cpf: FieldResult; name: FieldResult; birthDate: FieldResult };
  reasons: string[];
  /** Passos explicativos da decisão (nunca contém CPF completo). */
  trail: string[];
  nameVariants: string[];
  /** Nome normalizado do laudo a registrar como apelido do cliente (só em incorporar_com_alias). */
  aliasToRecord: string | null;
}

export interface AssessOptions {
  rules?: IdentityRules;
  /** Apelidos já verificados por CPF para este cliente (nomes normalizados, palavras separadas por espaço). */
  knownAliases?: readonly string[];
  /** Resultado dos detectores de evidência do texto do laudo. */
  evidence?: EvidenceResult;
}

// ---- CPF -------------------------------------------------------------------

export function normalizeCpf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  return digits.length === 11 ? digits : null;
}

export function isValidCpf(raw: string | null | undefined): boolean {
  const cpf = normalizeCpf(raw);
  if (!cpf) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number): number => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

function compareCpf(extracted: string | null | undefined, registered: string | null | undefined): FieldResult {
  const hasExtracted = !!extracted && String(extracted).trim() !== "";
  const hasRegistered = !!registered && String(registered).trim() !== "";
  if (!hasExtracted || !hasRegistered) return "ausente";
  if (!isValidCpf(extracted) || !isValidCpf(registered)) return "invalido";
  return normalizeCpf(extracted) === normalizeCpf(registered) ? "igual" : "diferente";
}

// ---- Nome ------------------------------------------------------------------

const PARTICLES = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);

function stripAccents(raw: string): string {
  return String(raw).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

export function normalizeName(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return stripAccents(raw)
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !PARTICLES.has(token));
}

/** Palavra do nome com a marca de abreviação ("Fern." termina com ponto no original). */
interface Tok { text: string; abbr: boolean }

function tokenize(raw: string | null | undefined): Tok[] {
  if (!raw) return [];
  const out: Tok[] = [];
  const clean = stripAccents(raw).replace(/['\u2019]/g, "").replace(/[-_]/g, " ");
  for (const piece of clean.split(/\s+/)) {
    const text = piece.replace(/[^A-Z]/g, "");
    if (!text || PARTICLES.has(text)) continue;
    out.push({ text, abbr: /\.$/.test(piece) && text.length > 1 });
  }
  return out;
}

/** Chave fonética do português do Brasil: grafias que soam igual produzem a mesma chave. */
export function phoneticKey(word: string): string {
  let s = word;
  s = s.replace(/PH/g, "F").replace(/CH/g, "X").replace(/SH/g, "X");
  s = s.replace(/NH/g, "N").replace(/LH/g, "L").replace(/TH/g, "T").replace(/RH/g, "R");
  s = s.replace(/H/g, "");
  s = s.replace(/Y/g, "I").replace(/W/g, "V").replace(/K/g, "C");
  s = s.replace(/C(?=[EI])/g, "S").replace(/Z/g, "S");
  s = s.replace(/(.)\1+/g, "$1");
  return s;
}

function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => [i, ...new Array(cols - 1).fill(0)]);
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[rows - 1][cols - 1];
}

type MatchKind = "igual" | "fonetica" | "grafia" | "abreviacao" | "inicial";
const RANK: Record<MatchKind, number> = { igual: 0, fonetica: 1, grafia: 2, abreviacao: 3, inicial: 4 };

function tokenMatch(a: Tok, b: Tok, maxEdit: number): MatchKind | null {
  if (a.text === b.text) return "igual";
  if (a.text.length === 1 || b.text.length === 1) return a.text[0] === b.text[0] ? "inicial" : null;
  if (a.abbr && b.text.startsWith(a.text)) return "abreviacao";
  if (b.abbr && a.text.startsWith(b.text)) return "abreviacao";
  const ka = phoneticKey(a.text);
  const kb = phoneticKey(b.text);
  if (ka === kb) return "fonetica";
  const shortest = Math.min(ka.length, kb.length);
  if (shortest < 4) return null;
  const allowed = Math.min(maxEdit, shortest >= 9 ? 2 : 1);
  return allowed > 0 && editDistance(ka, kb) <= allowed ? "grafia" : null;
}

/** Junta palavras vizinhas de X quando a junção casa com uma palavra de Y ("DAI ANA" -> "DAIANA"). */
function mergeSplits(x: Tok[], y: Tok[], maxEdit: number): { tokens: Tok[]; merged: boolean } {
  const out: Tok[] = [];
  let merged = false;
  for (let i = 0; i < x.length; i++) {
    const cur = x[i];
    const next = x[i + 1];
    if (next && cur.text.length > 1 && next.text.length > 1 && !cur.abbr && !next.abbr) {
      const candidate: Tok = { text: cur.text + next.text, abbr: false };
      const curExact = y.some((t) => t.text === cur.text);
      const nextExact = y.some((t) => t.text === next.text);
      if (candidate.text.length >= 4 && !curExact && !nextExact) {
        const hit = y.some((t) => {
          const m = tokenMatch(candidate, t, maxEdit);
          return m === "igual" || m === "fonetica" || m === "grafia";
        });
        if (hit) {
          out.push(candidate);
          merged = true;
          i++;
          continue;
        }
      }
    }
    out.push(cur);
  }
  return { tokens: out, merged };
}

interface NameComparison { result: FieldResult; kinds: VariantKind[]; normalized: string }

function compareName(
  extracted: string | null | undefined,
  registered: string | null | undefined,
  maxEdit: number,
  knownAliases: readonly string[],
): NameComparison {
  const a0 = tokenize(extracted);
  const b0 = tokenize(registered);
  const normalized = a0.map((t) => t.text).join(" ");
  if (a0.length === 0 || b0.length === 0) return { result: "ausente", kinds: [], normalized };
  if (normalized === b0.map((t) => t.text).join(" ")) return { result: "igual", kinds: [], normalized };
  if (knownAliases.includes(normalized)) return { result: "variante", kinds: ["alias_conhecido"], normalized };

  const kinds = new Set<VariantKind>();
  const ma = mergeSplits(a0, b0, maxEdit);
  const mb = mergeSplits(b0, ma.tokens, maxEdit);
  const a = ma.tokens;
  const b = mb.tokens;
  if (ma.merged || mb.merged) kinds.add("token_dividido");

  const aIsShorter = a.length <= b.length;
  const shorter = aIsShorter ? a : b;
  const longer = aIsShorter ? b : a;

  // pareamento um-para-um, melhor correspondência primeiro (exata, fonética, grafia, abreviação, inicial)
  const pairs: Array<{ s: number; l: number; kind: MatchKind }> = [];
  shorter.forEach((s, si) => longer.forEach((l, li) => {
    const kind = tokenMatch(s, l, maxEdit);
    if (kind) pairs.push({ s: si, l: li, kind });
  }));
  pairs.sort((p, q) => RANK[p.kind] - RANK[q.kind] || Math.abs(p.s - p.l) - Math.abs(q.s - q.l));
  const usedS = new Set<number>();
  const usedL = new Set<number>();
  const assigned = new Map<number, { l: number; kind: MatchKind }>();
  for (const p of pairs) {
    if (usedS.has(p.s) || usedL.has(p.l)) continue;
    usedS.add(p.s);
    usedL.add(p.l);
    assigned.set(p.s, { l: p.l, kind: p.kind });
  }

  const allShorterMatched = assigned.size === shorter.length;
  const nonInitial = [...assigned.values()].filter((m) => m.kind !== "inicial").length;
  const edgesOk = usedL.has(0) && usedL.has(longer.length - 1);
  if (allShorterMatched && shorter.length >= 2 && nonInitial >= 2 && edgesOk) {
    let lastL = -1;
    let crossed = false;
    shorter.forEach((_, si) => {
      const m = assigned.get(si)!;
      if (m.kind === "fonetica") kinds.add("fonetica");
      if (m.kind === "grafia") kinds.add("grafia");
      if (m.kind === "abreviacao") kinds.add("abreviacao");
      if (m.kind === "inicial") kinds.add("inicial");
      if (m.l < lastL) crossed = true;
      lastL = Math.max(lastL, m.l);
    });
    if (crossed) kinds.add("ordem");
    if (longer.length > shorter.length) kinds.add("subconjunto");
    return { result: kinds.size === 0 ? "igual" : "variante", kinds: [...kinds], normalized };
  }
  const anyCommon = pairs.length > 0;
  return { result: anyCommon ? "parcial" : "diferente", kinds: [], normalized };
}

// ---- Nascimento ------------------------------------------------------------

export function parseBirthDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = String(raw).trim();
  let y: number, m: number, d: number;
  let match = text.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})$/);
  if (match) {
    d = Number(match[1]); m = Number(match[2]); y = Number(match[3]);
  } else if ((match = text.match(/^(\d{4})[/.-](\d{2})[/.-](\d{2})(?:[T\s].*)?$/))) {
    y = Number(match[1]); m = Number(match[2]); d = Number(match[3]);
  } else {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 1900 || date.getTime() > Date.now()) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function compareBirth(extracted: string | null | undefined, registered: string | null | undefined): FieldResult {
  const hasA = !!extracted && String(extracted).trim() !== "";
  const hasB = !!registered && String(registered).trim() !== "";
  if (!hasA || !hasB) return "ausente";
  const a = parseBirthDate(extracted);
  const b = parseBirthDate(registered);
  if (!a || !b) return "invalido";
  return a === b ? "igual" : "diferente";
}

// ---- Veredito --------------------------------------------------------------

const KIND_LABEL: Record<string, string> = {
  fonetica: "grafia que soa igual (ex.: y/i, ss/s, z/s)",
  grafia: "pequena diferença de letras",
  inicial: "inicial no lugar do nome",
  abreviacao: "nome abreviado",
  ordem: "ordem dos nomes diferente",
  token_dividido: "nome separado ou colado em palavras diferentes",
  subconjunto: "nome do meio ou sobrenome omitido",
  alias_conhecido: "grafia já verificada antes por CPF",
};

function fieldLabel(r: FieldResult): string {
  return { igual: "igual", variante: "variante", parcial: "parcial", diferente: "diferente", ausente: "ausente", invalido: "inválido" }[r];
}

export function assessIdentity(extracted: IdentityData, registered: IdentityData, options: AssessOptions = {}): IdentityAssessment {
  const rules = options.rules ?? DEFAULT_RULES;
  const cpf = compareCpf(extracted.cpf, registered.cpf);
  const nameCmp = compareName(extracted.name, registered.name, rules.distanciaMaximaEdicao, options.knownAliases ?? []);
  const name = nameCmp.result;
  const birthDate = compareBirth(extracted.birthDate, registered.birthDate);
  const fields = { cpf, name, birthDate };
  const reasons: string[] = [];
  const nameOk = name === "igual" || name === "variante";
  const kinds = nameCmp.kinds;

  const trail: string[] = [
    `CPF: ${fieldLabel(cpf)}${cpf === "igual" ? " (11 dígitos, dígitos verificadores válidos, idêntico ao cadastro)" : ""}.`,
    `Nome: ${fieldLabel(name)}${kinds.length ? ` — ${kinds.map((k) => KIND_LABEL[k] ?? k).join("; ")}` : ""}.`,
    `Nascimento: ${fieldLabel(birthDate)}.`,
  ];

  const finish = (decision: IdentityDecision, verdict: IdentityVerdict, ruleNote: string): IdentityAssessment => {
    let finalDecision = decision;
    let finalVerdict = verdict;
    const ev = options.evidence;
    if (ev) {
      if (!ev.evaluated) trail.push("Texto do laudo não disponível: detector de dois pacientes não avaliado.");
      if (ev.findings.length > 0 && decision !== "quarentena") {
        finalDecision = "quarentena";
        finalVerdict = ev.findings.some((f) => f.verdict === "contradicao") ? "contradicao" : "revisao";
        for (const f of ev.findings) reasons.push(f.message);
        ruleNote = "Evidência material do laudo contradiz a identidade: quarentena (limite global).";
      } else if (ev.findings.length > 0) {
        for (const f of ev.findings) reasons.push(f.message);
        if (ev.findings.some((f) => f.verdict === "contradicao")) finalVerdict = "contradicao";
      }
    }
    trail.push(`Decisão: ${ruleNote}`);
    if (finalDecision === "incorporar" || finalDecision === "incorporar_com_alias") {
      if (reasons.length === 0) reasons.push(ruleNote);
    }
    return {
      verdict: finalVerdict,
      decision: finalDecision,
      fields,
      reasons,
      trail,
      nameVariants: kinds,
      aliasToRecord: finalDecision === "incorporar_com_alias" ? nameCmp.normalized : null,
    };
  };
  const quarantine = (verdict: IdentityVerdict, ...why: string[]) => {
    reasons.push(...why);
    return finish("quarentena", verdict, why[0] ?? "quarentena.");
  };

  if (cpf === "diferente") {
    return quarantine("contradicao", "CPF do laudo é válido e diferente do CPF cadastrado.");
  }

  if (cpf === "igual") {
    if (name === "diferente") {
      return quarantine("revisao", "CPF confere, mas o nome do laudo não tem nenhuma palavra em comum com o cadastro.");
    }
    if (birthDate === "diferente") {
      return quarantine("revisao", "CPF confere, mas a data de nascimento do laudo difere do cadastro.");
    }
    if (name === "parcial") {
      const policy = rules.nomeParcialComCpf;
      if (policy === "aceitar" || (policy === "aceitar_com_nascimento_igual" && birthDate === "igual")) {
        reasons.push("CPF confere e o nome é parcialmente compatível; aceito pela regra da clínica.");
        const result = finish("incorporar_com_alias", "confirmada", "CPF igual com nome parcial aceito pela regra da clínica; apelido registrado.");
        return result;
      }
      return quarantine("revisao", policy === "quarentena"
        ? "CPF confere, mas o nome é só parcialmente compatível e a regra da clínica manda revisar."
        : "CPF confere, mas o nome é só parcialmente compatível e a data de nascimento não confirma.");
    }
    if (name === "variante") {
      const allKindsAccepted = kinds.every((k) => rules.tiposDeVarianteAceitos.includes(k));
      if (!rules.variantesComCpf || !allKindsAccepted) {
        return quarantine("revisao", "CPF confere, mas a variante de nome não é aceita automaticamente pela regra da clínica.");
      }
      if (rules.exigirNascimentoParaAutoAceite && birthDate !== "igual") {
        return quarantine("revisao", "CPF confere com variante de nome, e a regra da clínica exige também o nascimento igual.");
      }
      reasons.push("CPF confere; variante de grafia do nome aceita e registrada como apelido.");
      return finish("incorporar_com_alias", "confirmada", "CPF igual com variante de grafia do nome: aceito, apelido e trilha registrados.");
    }
    reasons.push("CPF do laudo confere com o cadastro.");
    return finish("incorporar", "confirmada", "CPF igual ao cadastro, sem divergência de nome.");
  }

  if (cpf === "invalido") {
    return quarantine("revisao", "CPF ilegível ou com dígitos verificadores inválidos no laudo ou no cadastro.");
  }

  // A partir daqui: CPF ausente (laudo ou cadastro). Nome sozinho nunca prova identidade.
  if (birthDate === "diferente") {
    if (name === "ausente") {
      return quarantine("revisao", "Nascimento do laudo difere do cadastro e o nome não está disponível para comparar.");
    }
    return quarantine("contradicao", nameOk
      ? "Nascimento do laudo difere do cadastro com nome compatível; pode ser homônimo."
      : "Nascimento e nome do laudo divergem do cadastro.");
  }
  if (name === "diferente" && birthDate === "igual") {
    return quarantine("contradicao", "O nome do laudo não tem nenhuma palavra em comum com o cadastro.");
  }
  if (name === "igual" && birthDate === "igual") {
    reasons.push("Nome e data de nascimento conferem com o cadastro.");
    return finish("incorporar", "confirmada", "Sem CPF comparável: nome exato com nascimento igual.");
  }
  if (name === "variante" && birthDate === "igual") {
    if (rules.permitirPreliminarSemCpf) {
      reasons.push("CPF ausente: nome com variante e nascimento igual permitem só análise preliminar; não entra no prontuário sem CPF ou conferência humana.");
      return finish("preliminar", "revisao", "Sem CPF: variante de nome nunca entra no prontuário; análise preliminar liberada.");
    }
    return quarantine("revisao", "CPF ausente: nome com variante não é aceito sem conferência humana.");
  }

  if (cpf === "ausente") reasons.push("CPF ausente no laudo ou no cadastro.");
  if (birthDate === "ausente") reasons.push("Data de nascimento ausente no laudo ou no cadastro.");
  if (birthDate === "invalido") reasons.push("Data de nascimento ilegível.");
  if (name === "ausente") reasons.push("Nome ausente no laudo ou no cadastro.");
  if (name === "parcial") reasons.push("Nome parcialmente compatível; exige conferência humana.");
  if (name === "diferente") reasons.push("Nome do laudo difere do cadastro e não há outro dado para confirmar.");
  if (nameOk && birthDate !== "igual") reasons.push("Só o nome confere; nome sozinho não comprova identidade.");
  if (reasons.length === 0) reasons.push("Prova de identidade insuficiente.");
  return finish("quarentena", "revisao", reasons[0]);
}

/** Versão mascarada para listagens: nunca devolve CPF completo. */
export function maskCpf(raw: string | null | undefined): string | null {
  const cpf = normalizeCpf(raw);
  return cpf ? `***.***.***-${cpf.slice(9)}` : null;
}
