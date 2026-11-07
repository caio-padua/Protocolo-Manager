/**
 * Regra de paginação dos documentos médicos (decisão do CEO):
 *  1. Uma fórmula (ou item de exame / parágrafo) nunca é cortada ao meio entre duas páginas.
 *  2. Se o bloco inteiro, até o fim da posologia MAIS 1 linha em branco, não cabe no espaço
 *     que sobra na página, o bloco inteiro vai para a página seguinte.
 *  3. Vale para toda ferramenta que gera documento médico em PDF.
 *
 * Única exceção técnica: bloco maior que uma página inteira em branco não tem como caber;
 * nesse caso (e só nele) o texto flui para a página seguinte linha a linha.
 */

export interface RegraBlocoIntegro {
  /** Posição vertical atual (cresce para cima, como no pdf-lib). */
  y: number;
  /** Altura real do bloco, do título até a última linha (posologia). */
  alturaBloco: number;
  /** Margem inferior: abaixo dela não se escreve (rodapé). */
  limiteInferior: number;
  /** Altura de 1 linha em branco exigida ao final do bloco. */
  linhaEmBranco: number;
  /** Posição vertical inicial de uma página nova (topo útil). */
  topoPaginaNova: number;
}

/** Verdadeiro quando o bloco precisa ser empurrado inteiro para a próxima página. */
export function blocoDeveIrParaProximaPagina(r: RegraBlocoIntegro): boolean {
  const necessario = r.alturaBloco + r.linhaEmBranco;
  const cabeAqui = r.y - necessario >= r.limiteInferior;
  if (cabeAqui) return false;
  const cabeEmPaginaVazia = r.topoPaginaNova - necessario >= r.limiteInferior;
  // Se nem em página vazia cabe, empurrar não ajuda: deixa fluir.
  return cabeEmPaginaVazia;
}

/** Uma tomada por linha: separa por quebra de linha, ponto e vírgula ou " e N dose(s)". */
export function separarTomadas(posologia?: string | null): string[] {
  return (posologia ?? "")
    .split(/\n|;/)
    .flatMap((trecho) => trecho.split(/\s+e\s+(?=\d+\s*doses?\b)/i))
    .map((t) => t.trim())
    .filter(Boolean);
}

