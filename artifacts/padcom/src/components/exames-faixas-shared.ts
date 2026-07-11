// ===========================================================================
// CONSTANTES COMPARTILHADAS DAS 5 FAIXAS DOS EXAMES
//   Fonte única de cores/rótulos/direção usada tanto pela ferramenta
//   mestre-detalhe (DirecaoExamesTool) quanto pela PLANILHA geral
//   (CadastroPlanilhaFaixas). Espelha zones.ts do backend — NÃO reimplementa
//   o motor (só reaproveita as cores semânticas e a ordem das faixas).
// ===========================================================================

export const NAVY = "#16294a";
export const GOLD = "#b8924d";
export const MUTED = "#647c97";

export type Direction = "higher_better" | "lower_better" | "target";

export const DIRECTION_ROTULO: Record<Direction, string> = {
  higher_better: "Quanto MAIOR, melhor",
  lower_better: "Quanto MENOR, melhor",
  target: "Melhor no MEIO (alvo)",
};

// Paleta e rótulos-base das 5 zonas (espelha zones.ts do backend).
export type ZoneLabel = "ALERTA" | "ATENCAO" | "INSUFICIENTE" | "ACEITAVEL" | "EXCELENTE";
export const ZONE_COLOR: Record<ZoneLabel, string> = {
  ALERTA: "#b4413c",
  ATENCAO: "#c17a2b",
  INSUFICIENTE: "#d0a53f",
  ACEITAVEL: "#7a9a4a",
  EXCELENTE: "#3f7a3f",
};
export const ZONE_ROTULO: Record<ZoneLabel, string> = {
  ALERTA: "ALERTA",
  ATENCAO: "ATENÇÃO",
  INSUFICIENTE: "INSUFICIENTE",
  ACEITAVEL: "ACEITÁVEL",
  EXCELENTE: "EXCELENTE",
};
// Ordem das 5 posições do MENOR valor ao MAIOR (below → t1 → t2 → t3 → above).
export const FAIXAS_POR_DIRECAO: Record<Direction, ZoneLabel[]> = {
  higher_better: ["ALERTA", "INSUFICIENTE", "ACEITAVEL", "EXCELENTE", "ATENCAO"],
  lower_better: ["ATENCAO", "EXCELENTE", "ACEITAVEL", "INSUFICIENTE", "ALERTA"],
  target: ["ALERTA", "ACEITAVEL", "EXCELENTE", "ACEITAVEL", "ATENCAO"],
};

// pt-BR: "5,4" -> 5.4 ; "" -> null
export function parseNum(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
export function fmt(n: number | null): string {
  if (n === null) return "";
  return String(n).replace(".", ",");
}
