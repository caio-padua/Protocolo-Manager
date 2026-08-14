// ============================================================
// Dados REAIS do cliente 44 (CAIO HENRIQUE FERNANDES PADUA),
// lidos de exam_results + exam_analyte_catalog em 14/08/2026.
// Nenhum valor inventado: cada ponto veio do banco de producao.
// ============================================================

export type Direcao = "lower_better" | "higher_better" | "target";

export interface Ponto {
  data: string;   // AAAA-MM-DD
  valor: number;
}

export interface Marcador {
  nome: string;
  unidade: string;
  direcao: Direcao;
  refLow: number | null;
  refHigh: number | null;
  serie: Ponto[];
}

export const MARCADORES: Marcador[] = [
  {
    nome: "Ácido Úrico",
    unidade: "mg/dL",
    direcao: "lower_better",
    refLow: 3.4,
    refHigh: 7,
    serie: [
      { data: "2020-07-26", valor: 5.5 },
      { data: "2021-09-26", valor: 5.7 },
      { data: "2023-07-26", valor: 5.1 },
      { data: "2026-03-26", valor: 4.3 },
      { data: "2026-06-11", valor: 4.0 },
    ],
  },
  {
    nome: "Proteína C Reativa Ultra Sensível",
    unidade: "mg/dL",
    direcao: "lower_better",
    refLow: null,
    refHigh: 0.5,
    serie: [
      { data: "2021-02-27", valor: 0.18 },
      { data: "2021-09-26", valor: 0.14 },
      { data: "2023-07-26", valor: 3.33 },
      { data: "2026-03-26", valor: 0.84 },
      { data: "2026-06-11", valor: 0.29 },
    ],
  },
  {
    nome: "Hemoglobina Glicada (HbA1c)",
    unidade: "%",
    direcao: "lower_better",
    refLow: null,
    refHigh: 5.7,
    serie: [
      { data: "2021-02-27", valor: 5.2 },
      { data: "2021-09-26", valor: 5.3 },
      { data: "2023-07-26", valor: 5.3 },
      { data: "2026-03-26", valor: 5.3 },
      { data: "2026-06-11", valor: 5.5 },
    ],
  },
  {
    nome: "TSH",
    unidade: "µUI/mL",
    direcao: "target",
    refLow: 0.4,
    refHigh: 4.3,
    serie: [
      { data: "2020-02-24", valor: 2.31 },
      { data: "2021-09-26", valor: 2.02 },
      { data: "2023-07-26", valor: 1.75 },
      { data: "2026-03-26", valor: 2.95 },
      { data: "2026-06-11", valor: 2.01 },
    ],
  },
];

// ---------- Motor de veredito (mesma regra que o back vai usar) ----------
// O veredito descreve ASSOCIACAO temporal, nunca causa provada.
export type Veredito = "favoravel" | "desfavoravel" | "estavel" | "sem_veredito";

/** Um valor esta dentro da faixa de referencia? Referencia ausente nao restringe. */
function dentroDaFaixa(v: number, refLow: number | null, refHigh: number | null) {
  return (refLow === null || v >= refLow) && (refHigh === null || v <= refHigh);
}

export function julgar(direcao: Direcao, de: number, para: number, refLow: number | null, refHigh: number | null): Veredito {
  // 1) Marcador "target" sem a faixa completa nao pode ser julgado.
  //    Devolver "estavel" aqui seria mentir por omissao — falha explicita.
  if (direcao === "target" && (refLow === null || refHigh === null)) return "sem_veredito";

  const delta = para - de;

  // 2) CRUZAR a faixa de referencia vence o limiar de ruido.
  //    Sair da faixa (ou voltar para ela) e sempre sinal clinico, por menor
  //    que seja a variacao percentual. Ex.: HbA1c 5,6 -> 5,7 sobe so 1,8%
  //    mas atravessa o teto de referencia: nunca pode virar "estavel".
  const temFaixa = refLow !== null || refHigh !== null;
  const estavaDentro = dentroDaFaixa(de, refLow, refHigh);
  const estaDentro = dentroDaFaixa(para, refLow, refHigh);
  if (temFaixa && estavaDentro !== estaDentro) {
    return estaDentro ? "favoravel" : "desfavoravel";
  }

  // 3) So agora o corte de ruido de laboratorio.
  //    PROVISORIO: 3% e um corte global. Antes de ir para o backend isto
  //    precisa virar tolerancia POR ANALITO (o ruido do TSH nao e o da HbA1c).
  if (Math.abs(delta) / (Math.abs(de) || 1) < 0.03) return "estavel";

  if (direcao === "lower_better") return delta < 0 ? "favoravel" : "desfavoravel";
  if (direcao === "higher_better") return delta > 0 ? "favoravel" : "desfavoravel";

  // target: favoravel = aproximou-se do centro da faixa
  const centro = (refLow! + refHigh!) / 2;
  return Math.abs(para - centro) < Math.abs(de - centro) ? "favoravel" : "desfavoravel";
}

export function pct(de: number, para: number) {
  if (de === 0) return 0;
  return ((para - de) / Math.abs(de)) * 100;
}

/** Lei do Numeral: os dois valores do par exibem SEMPRE as mesmas casas
 *  decimais, para o olho comparar em coluna (4,3 -> 4,0, nunca 4,3 -> 4). */
export function parNum(a: number, b: number): [string, string] {
  const casas = Math.max(
    String(a).split(".")[1]?.length ?? 0,
    String(b).split(".")[1]?.length ?? 0,
  );
  return [a.toFixed(casas).replace(".", ","), b.toFixed(casas).replace(".", ",")];
}

export function dataBR(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export function mesBR(iso: string) {
  const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const [a, m] = iso.split("-");
  return `${MES[Number(m) - 1]}/${a.slice(2)}`;
}

// ---------- Aderencia (a peca que HOJE nao existe) ----------
// Numeros ilustrativos do que o motor passará a medir por janela de exame.
export interface JanelaAderencia {
  de: string;
  ate: string;
  aderencia: number;   // 0..100
  dosesPrevistas: number;
  dosesTomadas: number;
}

export const JANELAS: JanelaAderencia[] = [
  { de: "2023-07-26", ate: "2026-03-26", aderencia: 61, dosesPrevistas: 2904, dosesTomadas: 1771 },
  { de: "2026-03-26", ate: "2026-06-11", aderencia: 92, dosesPrevistas: 234, dosesTomadas: 215 },
];

// ---------- Frentes terapeuticas (V1 aprovado pelo CEO) ----------
export const FRENTES = [
  { id: "formulas",   rotulo: "Fórmulas Magistrais",  fonte: "lembretes_prescricao",  cor: "#d9b978" },
  { id: "injetavel",  rotulo: "Protocolo Injetável",  fonte: "protocols / sessions",  cor: "#6fb1e8" },
  { id: "nutricao",   rotulo: "Plano Nutricional",    fonte: "motor de dieta",        cor: "#5fc79a" },
  { id: "consulta",   rotulo: "Próxima Consulta",     fonte: "agenda",                cor: "#c99be8" },
] as const;
