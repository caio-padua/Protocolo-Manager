// ============================================================================
// Sala de Triagem — motor unico de classificacao de grafias cruas de laudo.
//
// Uma grafia crua de exame que a importacao NAO casou no catalogo passa por aqui
// e recebe UM destino, sempre, sem perda:
//   apelido    -> alta confianca: e o mesmo exame de outro cadastro (vira sinonimo)
//   novo       -> exame novo distinto: cria cadastro DESCOBERTO automatico (ativo)
//   ambiguo    -> parece variante de um exame existente -> quarentena A CONFERIR
//   nao_exame  -> bioimpedancia/subitem de hemograma/urina -> ignorado por padrao
//
// Linhas vermelhas clinicas (nunca fundir como apelido — sao exames UNICOS):
//   Testosterona Biodisponivel, Testosterona Livre Calculada, T3 Reverso,
//   1,25-dihidroxi Vitamina D / Calcitriol. Token de perigo -> forca "novo".
//
// O mesmo motor serve a faxina em massa (backfill) e a importacao em tempo real.
// ============================================================================
import {
  db,
  examAnalyteCatalogTable,
  examAnalyteTriagemTable,
  examResultsTable,
} from "@workspace/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { normalizeAnalyteName } from "./persist";
import { chaveFaixa } from "./zones";

export type TriagemKind = "apelido" | "novo" | "ambiguo" | "nao_exame";

export interface Classification {
  kind: TriagemKind;
  /** exame alvo (apelido) ou palpite (ambiguo) */
  code: string | null;
  reason: string;
}

export interface CatalogEntryFull {
  code: string;
  displayName: string;
  /** chaves normalizadas (displayName + sinonimos) para casamento exato */
  keys: Set<string>;
  /** tokens fortes do displayName para deteccao de ambiguidade */
  tokens: Set<string>;
}

// ---------------------------------------------------------------------------
// Dicionarios
// ---------------------------------------------------------------------------

// Palavras de ruido de metodo/coleta que nao mudam a identidade do exame.
const NOISE_WORDS = new Set([
  "de", "do", "da", "dos", "das", "e", "em", "no", "na", "por", "para", "com",
  "dosagem", "pesquisa", "nivel", "niveis", "exame", "teste", "serico", "serica",
  "soro", "plasma", "sangue", "sanguineo", "quantitativo", "quantitativa",
  "automatizado", "metodo", "sorologia",
]);

// Stopwords para overlap de token (inclui palavras clinicas comuns que sozinhas
// nao distinguem um exame de outro). Deixadas de fora do sinal de ambiguidade.
const STOPWORDS = new Set([
  ...NOISE_WORDS,
  "total", "livre", "fracao", "indice", "relacao", "tipo", "geral",
]);

// Tokens de PERIGO clinico: se presentes, o exame e distinto e NUNCA vira apelido.
const DANGER_TOKENS = [
  "biodisponivel",
  "calculada",
  "reverso",
  "reverse",
  "t3r",
  "dihidroxi",
  "1 25",
  "1,25",
  "calcitriol",
];

// NAO-EXAME por igualdade exata da chave normalizada.
const NAO_EXAME_EXACT = new Set([
  "peso", "imc", "altura", "cor", "aspecto", "ph", "nitrito", "bacterias",
  "densidade", "segmentados", "bastonetes", "bastoes", "mielocitos",
  "metamielocitos", "promielocitos", "blastos", "muco", "cristais", "cilindros",
  "flora", "corpos cetonicos", "urobilinogenio",
]);

// NAO-EXAME por conter o trecho (bioimpedancia / InBody / antropometria).
const NAO_EXAME_SUBSTR = [
  "inbody",
  "massa muscular",
  "massa magra",
  "massa gorda",
  "massa ossea",
  "massa livre de gordura",
  "gordura visceral",
  "gordura corporal",
  "percentual de gordura",
  "agua corporal",
  "taxa metabolica",
  "angulo de fase",
  "circunferencia",
  "relacao cintura",
  "pontuacao inbody",
  "indice de massa corporal",
];

function isNaoExame(key: string): boolean {
  if (NAO_EXAME_EXACT.has(key)) return true;
  return NAO_EXAME_SUBSTR.some((p) => key.includes(p));
}

function hasDangerToken(key: string): boolean {
  return DANGER_TOKENS.some((t) => key.includes(t));
}

/** Dois nomes compartilham o MESMO token de perigo (sao irmaos da red-line)? */
function shareDangerToken(key: string, entry: CatalogEntryFull): boolean {
  return DANGER_TOKENS.some(
    (t) => key.includes(t) && [...entry.keys].some((k) => k.includes(t)),
  );
}

/** Remove palavras de ruido de metodo/coleta, preservando a identidade. */
function stripNoise(key: string): string {
  return key
    .split(" ")
    .filter((w) => w && !NOISE_WORDS.has(w))
    .join(" ")
    .trim();
}

/**
 * Tokens fortes (para overlap de ambiguidade). Guarda palavras >= 3 letras e
 * siglas alfanumericas (b12, t3, t4). IGNORA tokens puramente numericos ("1",
 * "2", "125") — eles casam qualquer coisa ("HIV 1 + 2" nao e variante de
 * "IGF-1") e inflam a fila com ambiguidade falsa.
 */
export function strongTokens(key: string): Set<string> {
  const out = new Set<string>();
  for (const w of key.split(" ")) {
    if (!w || STOPWORDS.has(w)) continue;
    const pureDigit = /^\d+$/.test(w);
    const alnum = /[a-z]/.test(w) && /\d/.test(w);
    if ((w.length >= 3 && !pureDigit) || alnum) out.add(w);
  }
  return out;
}

/** Sigla entre parenteses: "hormonio tireoestimulante (TSH)" -> "tsh". */
function parenAcronym(raw: string): string | null {
  const m = raw.match(/\(([^)]{2,14})\)/);
  return m ? normalizeAnalyteName(m[1]) : null;
}

// ---------------------------------------------------------------------------
// Motor de classificacao (puro)
// ---------------------------------------------------------------------------

export function buildCatalogEntry(
  code: string,
  displayName: string,
  synonyms: string[],
): CatalogEntryFull {
  const keys = new Set<string>([normalizeAnalyteName(displayName)]);
  for (const s of synonyms ?? []) keys.add(normalizeAnalyteName(s));
  const tokens = strongTokens(normalizeAnalyteName(displayName));
  return { code, displayName, keys, tokens };
}

export function classifyRawName(
  raw: string,
  catalog: CatalogEntryFull[],
): Classification {
  const key = normalizeAnalyteName(raw);
  if (!key) return { kind: "nao_exame", code: null, reason: "grafia vazia" };

  // (a) casamento exato com nome/apelido do catalogo
  for (const e of catalog) {
    if (e.keys.has(key)) {
      return { kind: "apelido", code: e.code, reason: "casa exato no catalogo" };
    }
  }

  // (b) nao-exame (bioimpedancia / subitem)
  if (isNaoExame(key)) {
    return { kind: "nao_exame", code: null, reason: "bioimpedancia ou subitem" };
  }

  const danger = hasDangerToken(key);

  // (c) sigla entre parenteses casa exato — so quando NAO ha perigo clinico
  // (uma red-line nunca vira apelido automatico de um exame-base).
  if (!danger) {
    const pk = parenAcronym(raw);
    if (pk) {
      for (const e of catalog) {
        if (e.keys.has(pk)) {
          return { kind: "apelido", code: e.code, reason: "sigla entre parenteses" };
        }
      }
    }

    // (d) apos limpar ruido de metodo casa exato
    const cleaned = stripNoise(key);
    if (cleaned && cleaned !== key) {
      for (const e of catalog) {
        if (e.keys.has(cleaned)) {
          return { kind: "apelido", code: e.code, reason: "casa apos limpar ruido" };
        }
      }
    }
  }

  // (e) overlap de token forte -> melhor candidato do catalogo
  const rawTokens = strongTokens(stripNoise(key) || key);
  let best: CatalogEntryFull | null = null;
  let bestOverlap = 0;
  for (const e of catalog) {
    let overlap = 0;
    for (const t of rawTokens) if (e.tokens.has(t)) overlap++;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = e;
    }
  }

  // (f) gate de perigo clinico: red-line so pode se aproximar de um IRMAO que
  // carrega o MESMO token de perigo (para o humano mesclar). Contra qualquer
  // exame-base comum -> exame NOVO distinto, nunca fusao.
  if (danger) {
    if (best && bestOverlap > 0 && shareDangerToken(key, best)) {
      return {
        kind: "ambiguo",
        code: best.code,
        reason: `parece variante de ${best.displayName}`,
      };
    }
    return { kind: "novo", code: null, reason: "exame clinicamente distinto" };
  }

  // (g) sem perigo: overlap -> ambiguo; nada -> novo
  if (best && bestOverlap > 0) {
    return {
      kind: "ambiguo",
      code: best.code,
      reason: `parece variante de ${best.displayName}`,
    };
  }
  return { kind: "novo", code: null, reason: "sem semelhanca com o catalogo" };
}

// ---------------------------------------------------------------------------
// Acoes (mutam o banco) — usadas pela faxina, pelo runtime e pela tela
// ---------------------------------------------------------------------------

export async function loadCatalogFull(): Promise<CatalogEntryFull[]> {
  const rows = await db
    .select()
    .from(examAnalyteCatalogTable)
    .where(eq(examAnalyteCatalogTable.active, true));
  return rows.map((r) =>
    buildCatalogEntry(r.code, r.displayName, r.synonyms ?? []),
  );
}

/**
 * Adiciona a grafia crua como sinonimo do exame alvo. Recusa (retorna false) se
 * a grafia ja pertence a OUTRO exame (nunca mistura). Idempotente. Atualiza a
 * entrada em memoria para os proximos casos do mesmo lote.
 */
export async function absorbAsAlias(
  targetCode: string,
  rawName: string,
  catalog: CatalogEntryFull[],
): Promise<boolean> {
  const key = normalizeAnalyteName(rawName);
  if (!key) return false;
  // colisao com outro exame?
  const owner = catalog.find((e) => e.keys.has(key));
  if (owner && owner.code !== targetCode) return false;

  const target = catalog.find((e) => e.code === targetCode);
  if (target && target.keys.has(key)) return true; // ja tem

  const row = await db
    .select({ synonyms: examAnalyteCatalogTable.synonyms })
    .from(examAnalyteCatalogTable)
    .where(eq(examAnalyteCatalogTable.code, targetCode))
    .limit(1);
  if (row.length === 0) return false;
  const syns = row[0].synonyms ?? [];
  if (!syns.some((s) => normalizeAnalyteName(s) === key)) {
    await db
      .update(examAnalyteCatalogTable)
      .set({ synonyms: [...syns, rawName.trim()] })
      .where(eq(examAnalyteCatalogTable.code, targetCode));
  }
  if (target) target.keys.add(key);
  return true;
}

/** Nome de exibicao a partir da grafia crua (apara e comprime espacos). */
function tidyDisplay(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Cria (ou reaproveita) um cadastro DESCOBERTO ativo a partir de uma grafia crua.
 * code = chaveFaixa(grafia); onConflictDoNothing garante ZERO duplicado. Atualiza
 * o catalogo em memoria. Retorna o code final.
 */
export async function createDiscoveredExam(
  rawName: string,
  catalog: CatalogEntryFull[],
  extraSynonyms: string[] = [],
): Promise<string> {
  const display = tidyDisplay(rawName);
  const code = chaveFaixa(display);
  const synonyms = Array.from(
    new Set(
      extraSynonyms
        .map((s) => s.trim())
        .filter((s) => s && normalizeAnalyteName(s) !== normalizeAnalyteName(display)),
    ),
  );
  await db
    .insert(examAnalyteCatalogTable)
    .values({ code, displayName: display, synonyms, origin: "descoberto", active: true })
    .onConflictDoNothing({ target: examAnalyteCatalogTable.code });
  // reflete em memoria (evita recriar/duplicar no mesmo lote)
  if (!catalog.some((e) => e.code === code)) {
    catalog.push(buildCatalogEntry(code, display, synonyms));
  }
  return code;
}

/** Upsert de uma linha da fila de triagem (idempotente por normKey). */
export async function upsertTriagem(
  rawName: string,
  kind: "ambiguo" | "nao_exame",
  suggestedCode: string | null,
  reason: string,
): Promise<void> {
  const normKey = normalizeAnalyteName(rawName);
  if (!normKey) return;
  await db
    .insert(examAnalyteTriagemTable)
    .values({
      normKey,
      sampleName: rawName.trim(),
      occurrences: 1,
      kind,
      suggestedCode,
      reason,
      status: "pendente",
    })
    .onConflictDoUpdate({
      target: examAnalyteTriagemTable.normKey,
      set: {
        occurrences: sql`${examAnalyteTriagemTable.occurrences} + 1`,
        updatedAt: new Date(),
      },
    });
}

/** Carimba analyte_code nas linhas cruas (ainda sem code) que casam por grafia. */
export async function setResultCodeForRaw(
  rawName: string,
  code: string,
): Promise<number> {
  const r = await db
    .update(examResultsTable)
    .set({ analyteCode: code })
    .where(
      and(
        isNull(examResultsTable.analyteCode),
        eq(examResultsTable.analyteNameRaw, rawName),
      ),
    )
    .returning({ id: examResultsTable.id });
  return r.length;
}

/**
 * Carimba analyte_code em TODAS as grafias cruas (ainda sem code) que normalizam
 * para a MESMA chave (normKey) — nao so a amostra exata. Uma linha de triagem
 * representa o cluster inteiro (dedup por normKey), entao a resolucao humana tem
 * de alcancar todas as variacoes de caixa/pontuacao/espaco. Zero perda.
 * Devolve as grafias efetivamente encontradas (para virarem sinonimos tambem).
 */
export async function setResultCodeForNormKey(
  normKey: string,
  code: string,
): Promise<{ carimbadas: number; variants: string[] }> {
  if (!normKey) return { carimbadas: 0, variants: [] };
  const raws = await db
    .selectDistinct({ name: examResultsTable.analyteNameRaw })
    .from(examResultsTable)
    .where(isNull(examResultsTable.analyteCode));
  const variants = raws
    .map((r) => r.name)
    .filter((n): n is string => !!n && normalizeAnalyteName(n) === normKey);
  if (variants.length === 0) return { carimbadas: 0, variants: [] };
  const r = await db
    .update(examResultsTable)
    .set({ analyteCode: code })
    .where(
      and(
        isNull(examResultsTable.analyteCode),
        inArray(examResultsTable.analyteNameRaw, variants),
      ),
    )
    .returning({ id: examResultsTable.id });
  return { carimbadas: r.length, variants };
}

export interface BackfillSummary {
  gruposProcessados: number;
  apelidos: number;
  novos: number;
  ambiguos: number;
  naoExames: number;
  linhasCarimbadas: number;
}

/**
 * FAXINA A EXAUSTAO — processa toda grafia crua sem code (analyte_code IS NULL),
 * agrupada por chave normalizada, aplicando o motor. Idempotente e sem perda.
 */
export async function runTriagemBackfill(): Promise<BackfillSummary> {
  const catalog = await loadCatalogFull();

  const rawRows = await db
    .select({
      name: examResultsTable.analyteNameRaw,
      n: sql<number>`count(*)`,
    })
    .from(examResultsTable)
    .where(isNull(examResultsTable.analyteCode))
    .groupBy(examResultsTable.analyteNameRaw);

  // agrupa grafias do MESMO teste (mesma chave normalizada) -> 1 cadastro so
  const clusters = new Map<string, { rep: string; variants: Set<string>; count: number }>();
  for (const r of rawRows) {
    if (!r.name) continue;
    const key = normalizeAnalyteName(r.name);
    if (!key) continue;
    const cur = clusters.get(key);
    if (cur) {
      cur.variants.add(r.name);
      cur.count += Number(r.n) || 0;
      if (r.name.length < cur.rep.length) cur.rep = r.name;
    } else {
      clusters.set(key, { rep: r.name, variants: new Set([r.name]), count: Number(r.n) || 0 });
    }
  }

  const summary: BackfillSummary = {
    gruposProcessados: 0,
    apelidos: 0,
    novos: 0,
    ambiguos: 0,
    naoExames: 0,
    linhasCarimbadas: 0,
  };

  for (const cluster of clusters.values()) {
    summary.gruposProcessados++;
    const cls = classifyRawName(cluster.rep, catalog);
    const variants = Array.from(cluster.variants);

    if (cls.kind === "apelido" && cls.code) {
      for (const v of variants) {
        const ok = await absorbAsAlias(cls.code, v, catalog);
        if (ok) summary.linhasCarimbadas += await setResultCodeForRaw(v, cls.code);
      }
      summary.apelidos++;
    } else if (cls.kind === "novo") {
      const code = await createDiscoveredExam(cluster.rep, catalog, variants);
      for (const v of variants) {
        await absorbAsAlias(code, v, catalog);
        summary.linhasCarimbadas += await setResultCodeForRaw(v, code);
      }
      summary.novos++;
    } else if (cls.kind === "ambiguo") {
      await upsertTriagem(cluster.rep, "ambiguo", cls.code, cls.reason);
      summary.ambiguos++;
    } else {
      await upsertTriagem(cluster.rep, "nao_exame", null, cls.reason);
      summary.naoExames++;
    }
  }

  return summary;
}

/**
 * Runtime (importacao) — resolve UMA grafia crua nao casada. Devolve o code
 * resolvido (apelido/novo) ou null (ambiguo/nao_exame vao para a fila). Nunca
 * lanca: a importacao segue mesmo se a triagem falhar.
 */
export async function triageOnImport(
  rawName: string,
  catalog: CatalogEntryFull[],
): Promise<string | null> {
  try {
    const cls = classifyRawName(rawName, catalog);
    if (cls.kind === "apelido" && cls.code) {
      const ok = await absorbAsAlias(cls.code, rawName, catalog);
      return ok ? cls.code : null;
    }
    if (cls.kind === "novo") {
      return await createDiscoveredExam(rawName, catalog, [rawName]);
    }
    await upsertTriagem(
      rawName,
      cls.kind === "ambiguo" ? "ambiguo" : "nao_exame",
      cls.code,
      cls.reason,
    );
    return null;
  } catch {
    return null;
  }
}
