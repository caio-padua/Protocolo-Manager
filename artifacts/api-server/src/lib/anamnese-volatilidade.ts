/**
 * O QUE MUDA E O QUE NAO MUDA ENTRE UMA ANAMNESE E A SEGUINTE.
 * fixa    = historia que nao muda (identidade, ancestralidade): vem preenchida da anterior.
 * acumula = historia que so cresce (cirurgias, alergias, doencas, familia): vem preenchida; o cliente ACRESCENTA.
 * muda    = estado atual (queixa, sintomas, habitos, medicacao, humor): vem EM BRANCO; a resposta anterior
 *           aparece so como referencia para comparar.
 * Classificacao proposta por bloco e por pergunta (id do questionario); revisavel pelo medico.
 */
export type Volatilidade = "fixa" | "acumula" | "muda";

// Classificacao feita sobre as 117 perguntas do questionario (conferida pelo enunciado de cada uma).
// Regra clinica: pergunta "ja teve / ja fez / diagnostico de" = historia (acumula); sintoma, escala de
// rastreio de periodo recente, habito, medicacao e preferencia = estado atual (muda).
const POR_PERGUNTA: Record<number, Volatilidade> = {
  // A. Identificacao: nao muda (idade 41 e recalculada, fica em branco)
  1: "fixa", 2: "fixa", 42: "fixa", 43: "fixa", 44: "fixa", 45: "fixa",
  // D. Diagnosticos ja feitos (o nivel de controle, 85, muda)
  6: "acumula", 82: "acumula", 83: "acumula", 84: "acumula",
  // E. Cirurgias, internacoes, anestesia
  8: "acumula", 315: "acumula", 9: "acumula", 88: "acumula",
  // F. Alergias e reacao grave
  10: "acumula", 90: "acumula",
  // I. CAGE (perguntas de "ja") e quem comentou: historia de vida
  100: "acumula", 101: "acumula", 102: "acumula", 103: "acumula", 333: "acumula", 334: "acumula",
  // J. Familia
  7: "acumula", 113: "acumula", 114: "acumula", 115: "acumula",
  // L. Numero de gestacoes
  135: "acumula",
};

export function volatilidadeDa(perguntaRowId: number): Volatilidade {
  return POR_PERGUNTA[perguntaRowId] ?? "muda";
}
export const ROTULO_VOLATILIDADE: Record<Volatilidade, string> = { fixa: "Fixa", acumula: "Acumula", muda: "Muda" };
/** Vem preenchida da anamnese anterior? */
export const herdaResposta = (v: Volatilidade) => v !== "muda";
