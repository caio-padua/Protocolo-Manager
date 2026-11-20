/**
 * O QUE MUDA E O QUE NAO MUDA ENTRE UMA ANAMNESE E A SEGUINTE.
 * fixa    = historia que nao muda (identidade, ancestralidade): vem preenchida da anterior.
 * acumula = historia que so cresce (cirurgias, alergias, doencas, familia): vem preenchida; o cliente ACRESCENTA.
 * muda    = estado atual (queixa, sintomas, habitos, medicacao, humor): vem EM BRANCO; a resposta anterior
 *           aparece so como referencia para comparar.
 * Classificacao proposta por bloco e por pergunta (id do questionario); revisavel pelo medico.
 */
export type Volatilidade = "fixa" | "acumula" | "muda";

const POR_PERGUNTA: Record<number, Volatilidade> = {
  1: "fixa", 2: "fixa", 42: "fixa", 43: "fixa", 44: "fixa", 45: "fixa", // A: nome, CPF, sexo biologico, etnia, profissao, escolaridade
  41: "muda",                                                              // idade (recalculada)
  6: "acumula", 82: "acumula", 83: "acumula", 84: "acumula",               // D: diagnosticos ja feitos
  85: "muda",                                                              // D: nivel de controle muda
  8: "acumula", 315: "acumula", 9: "acumula", 88: "acumula",               // E: cirurgias, internacoes, anestesia
  10: "acumula", 90: "acumula",                                            // F: alergias
  7: "acumula", 113: "acumula", 114: "acumula", 115: "acumula",            // J: familia
  99: "acumula",                                                           // L: numero de gestacoes
};

export function volatilidadeDa(perguntaRowId: number): Volatilidade {
  return POR_PERGUNTA[perguntaRowId] ?? "muda";
}
export const ROTULO_VOLATILIDADE: Record<Volatilidade, string> = { fixa: "Fixa", acumula: "Acumula", muda: "Muda" };
/** Vem preenchida da anamnese anterior? */
export const herdaResposta = (v: Volatilidade) => v !== "muda";
