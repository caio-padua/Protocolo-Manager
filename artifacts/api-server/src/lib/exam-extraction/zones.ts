// ===========================================================================
// Motor de FAIXAS (5 zonas) — cópia fiel do motor do IHE
//   Fonte: caio-padua/Integrative-Health-Engine (branch replit-agent)
//   artifacts/api-server/src/lib/laboratorio/motorClassificacaoIntegrativa.ts
//
// Regra: a zona normal [min, max] é dividida em TRÊS terços iguais
// (INFERIOR / MÉDIO / SUPERIOR). A DIREÇÃO do exame ("terco_excelente" no IHE,
// `direction` no Manager) diz qual terço é o "excelente" — é o que varia de
// exame para exame e é editável. Somam-se abaixo-do-mínimo e acima-do-máximo
// para dar 5 zonas posicionais.
//
// Art.47 (zero dado inventado): min/max vêm do laudo real; a direção vem do
// catálogo real (exam_analyte_catalog.direction) ou da tabela transmutada do
// IHE (direcao_favoravel_exame). Sem min/max => sem faixa.
// ===========================================================================

export type Direction = "higher_better" | "lower_better" | "target";

export type ZoneKey = "below" | "t1" | "t2" | "t3" | "above";

export type ZoneLabel =
  | "ALERTA"
  | "ATENCAO"
  | "INSUFICIENTE"
  | "ACEITAVEL"
  | "EXCELENTE";

export interface Zone {
  key: ZoneKey;
  /** rótulo semântico (editável por exame) */
  name: string;
  /** cor hex */
  color: string;
  /** limite inferior (null = -infinito) */
  low: number | null;
  /** limite superior (null = +infinito) */
  high: number | null;
}

// Paleta dos rótulos (marca navy/ouro preserva verdes funcionais de status).
export const ZONE_COLOR: Record<ZoneLabel, string> = {
  ALERTA: "#b4413c", // vermelho — fora, exige médico
  ATENCAO: "#c17a2b", // laranja — fora, exige contexto clínico
  INSUFICIENTE: "#d0a53f", // âmbar — dentro, longe do alvo
  ACEITAVEL: "#7a9a4a", // verde-oliva — dentro, aceitável
  EXCELENTE: "#3f7a3f", // verde forte — no terço favorável
};

/**
 * Chave canônica de uma faixa por exame (tabela exam_analyte_ranges).
 * Unifica a leitura/gravação nos três pontos (/evolucao, GET/PUT /faixas e a
 * semente): remove acentos, apara e minúsculo. Assim uma faixa editada no
 * Cockpit reflete na Config e vice-versa, e a semente casa com a Evolução.
 */
export function chaveFaixa(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * NOME INTERNO ("code") específico e fatiado — o "genótipo" fixo de um exame.
 * Ex.: "Vitamina D 25-OH (Calcidiol)" -> "vitamina-d-25oh-calcidiol".
 *
 * Papel DIFERENTE de chaveFaixa (que normaliza para COMPARAR/casar grafias):
 * slugInterno GERA a identidade de exames NOVOS. Nunca reescreve codes que já
 * existem. Regras (spec nome-interno-especifico-exame.md):
 *   1. tira acento + minúsculo
 *   2. parênteses viram separador (o conteúdo permanece)
 *   3. vírgula entre dígitos vira hífen (1,25 -> 1-25)
 *   4. forma da molécula cola (25-OH / 25 OH -> 25oh)
 *   5. qualquer outro separador vira hífen
 *   6. colapsa hífens repetidos e apara as pontas
 */
export function slugInterno(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/(\d),(\d)/g, "$1-$2")
    .replace(/(\d)[\s-]+([a-z]{1,3})\b/g, "$1$2")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Rótulo de cada posição por direção (spec §3, motor do IHE).
export const LABELS_BY_DIRECTION: Record<Direction, Record<ZoneKey, ZoneLabel>> = {
  higher_better: {
    below: "ALERTA",
    t1: "INSUFICIENTE",
    t2: "ACEITAVEL",
    t3: "EXCELENTE",
    above: "ATENCAO",
  },
  lower_better: {
    below: "ATENCAO",
    t1: "EXCELENTE",
    t2: "ACEITAVEL",
    t3: "INSUFICIENTE",
    above: "ALERTA",
  },
  target: {
    below: "ALERTA",
    t1: "ACEITAVEL",
    t2: "EXCELENTE",
    t3: "ACEITAVEL",
    above: "ATENCAO",
  },
};

/**
 * Resolve a direção de um exame a partir das fontes reais, em ordem:
 *   1. exam_analyte_catalog.direction (higher_better/lower_better/target)
 *   2. direcao_favoravel_exame (transmutado do IHE):
 *        SUBIR_BOM -> higher_better | DESCER_BOM/INFERIOR -> lower_better
 *   3. target (neutro; CEO ajusta no bloco editável)
 */
export function resolveDirection(
  catalogDirection: string | null | undefined,
  iheDirecao: string | null | undefined,
): Direction {
  const c = (catalogDirection ?? "").trim().toLowerCase();
  if (c === "higher_better" || c === "lower_better" || c === "target") {
    return c as Direction;
  }
  const i = (iheDirecao ?? "").trim().toUpperCase();
  if (i === "SUBIR_BOM" || i === "SUPERIOR") return "higher_better";
  if (i === "DESCER_BOM" || i === "INFERIOR") return "lower_better";
  if (i === "MEDIO" || i === "ALVO" || i === "TARGET") return "target";
  return "target";
}

/**
 * Deriva as 5 zonas por trisecção da faixa normal [refLow, refHigh].
 * Retorna null quando não há min/max reais (sem faixa fantasia).
 */
export function computeZones(
  refLow: number | null,
  refHigh: number | null,
  direction: Direction,
): Zone[] | null {
  if (refLow === null || refHigh === null || !Number.isFinite(refLow) || !Number.isFinite(refHigh)) {
    return null;
  }
  if (refHigh <= refLow) return null;

  const faixa = refHigh - refLow;
  const c1 = refLow + faixa / 3; // limite INFERIOR|MÉDIO
  const c2 = refLow + (2 * faixa) / 3; // limite MÉDIO|SUPERIOR
  const labels = LABELS_BY_DIRECTION[direction];

  const mk = (key: ZoneKey, low: number | null, high: number | null): Zone => {
    const label = labels[key];
    return { key, name: label, color: ZONE_COLOR[label], low, high };
  };

  return [
    mk("below", null, refLow),
    mk("t1", refLow, c1),
    mk("t2", c1, c2),
    mk("t3", c2, refHigh),
    mk("above", refHigh, null),
  ];
}

/**
 * Zonas explícitas do Subcadastro (exam_analyte_ranges), quando existirem.
 * `ordem` 1..5 mapeia below/t1/t2/t3/above; qualquer nome/cor/limite valem.
 */
export function overrideZones(
  rows: Array<{
    faixaName: string;
    low: number | null;
    high: number | null;
    color: string | null;
    ordem: number;
  }>,
): Zone[] | null {
  if (!rows.length) return null;
  const ordered = [...rows].sort((a, b) => a.ordem - b.ordem);
  const keyByIndex: ZoneKey[] = ["below", "t1", "t2", "t3", "above"];
  return ordered.map((r, i) => ({
    key: keyByIndex[Math.min(i, 4)],
    name: r.faixaName,
    color: r.color ?? "#6b7280",
    low: r.low,
    high: r.high,
  }));
}

/**
 * Classifica um valor numérico numa zona. Usa first-match por [low, high),
 * com a última zona inclusiva no topo. Retorna null se não cair em nenhuma.
 */
export function classifyIntoZones(value: number | null, zones: Zone[] | null): Zone | null {
  if (value === null || !Number.isFinite(value) || !zones || !zones.length) return null;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    const okLow = z.low === null || value >= z.low;
    const isLast = i === zones.length - 1;
    const okHigh = z.high === null || (isLast ? value <= z.high : value < z.high);
    if (okLow && okHigh) return z;
  }
  return null;
}
