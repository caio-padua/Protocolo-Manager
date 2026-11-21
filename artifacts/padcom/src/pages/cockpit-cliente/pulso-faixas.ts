// Limites dos cinco níveis de pressão e glicemia do Pulso Diário (adultos, medida em casa).
// Fonte única: a tabela, os gráficos e a janela "Níveis" leem daqui. Quando a área de edição do médico
// existir, ela passa a entregar este mesmo formato (basta trocar a origem destes valores).

export type Nivel = "muitobaixo" | "baixo" | "normal" | "alto" | "muitoalto";

export const LIMITES = {
  // Pressão: o nível vale pelo PIOR entre sistólica (s) e diastólica (d). Cada valor é o início do nível.
  pressao: { baixa: { s: 90, d: 60 }, muitoBaixa: { s: 80, d: 50 }, alta: { s: 130, d: 80 }, muitoAlta: { s: 160, d: 100 } },
  // Glicemia de jejum (mg/dL).
  glicemia: { muitoBaixa: 54, baixa: 70, alta: 100, muitoAlta: 126 },
} as const;

export function nivelPressao(s: number | null, d: number | null): Nivel | null {
  if (s == null && d == null) return null;
  const P = LIMITES.pressao, S = s ?? NaN, D = d ?? NaN;
  if (S < P.muitoBaixa.s || D < P.muitoBaixa.d) return "muitobaixo";
  if (S < P.baixa.s || D < P.baixa.d) return "baixo";
  if (S >= P.muitoAlta.s || D >= P.muitoAlta.d) return "muitoalto";
  if (S >= P.alta.s || D >= P.alta.d) return "alto";
  return "normal";
}

export function nivelGlicemia(g: number | null): Nivel | null {
  if (g == null) return null;
  const G = LIMITES.glicemia;
  return g < G.muitoBaixa ? "muitobaixo" : g < G.baixa ? "baixo" : g >= G.muitoAlta ? "muitoalto" : g >= G.alta ? "alto" : "normal";
}

export const NIVEIS: Array<{ id: Nivel; nome: string }> = [
  { id: "muitobaixo", nome: "Muito baixo" }, { id: "baixo", nome: "Baixo" }, { id: "normal", nome: "Normal" },
  { id: "alto", nome: "Alto" }, { id: "muitoalto", nome: "Muito alto" },
];

/** Faixas escritas para a tela: [sistólica, diastólica] por nível. */
export function faixasPressao(): Record<Nivel, [string, string]> {
  const P = LIMITES.pressao;
  return {
    muitobaixo: [`menor que ${P.muitoBaixa.s}`, `menor que ${P.muitoBaixa.d}`],
    baixo: [`${P.muitoBaixa.s} a ${P.baixa.s - 1}`, `${P.muitoBaixa.d} a ${P.baixa.d - 1}`],
    normal: [`${P.baixa.s} a ${P.alta.s - 1}`, `${P.baixa.d} a ${P.alta.d - 1}`],
    alto: [`${P.alta.s} a ${P.muitoAlta.s - 1}`, `${P.alta.d} a ${P.muitoAlta.d - 1}`],
    muitoalto: [`${P.muitoAlta.s} ou mais`, `${P.muitoAlta.d} ou mais`],
  };
}
export function faixasGlicemia(): Record<Nivel, string> {
  const G = LIMITES.glicemia;
  return {
    muitobaixo: `menor que ${G.muitoBaixa}`, baixo: `${G.muitoBaixa} a ${G.baixa - 1}`, normal: `${G.baixa} a ${G.alta - 1}`,
    alto: `${G.alta} a ${G.muitoAlta - 1}`, muitoalto: `${G.muitoAlta} ou mais`,
  };
}
