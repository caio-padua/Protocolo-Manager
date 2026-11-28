const PARTICULAS = new Set(["da", "das", "de", "do", "dos", "e"]);

/**
 * Abrevia somente a apresentação. O último nome e as partículas são preservados.
 * A medição é fornecida pelo navegador para respeitar a fonte e o espaço reais.
 */
export function abreviarNomeCliente(
  nome: string,
  larguraDisponivel: number,
  medir: (texto: string) => number,
): string {
  if (!nome.trim() || !Number.isFinite(larguraDisponivel) || larguraDisponivel <= 0) {
    return nome;
  }

  let larguraAtual = medir(nome);
  if (!Number.isFinite(larguraAtual) || larguraAtual <= larguraDisponivel) {
    return nome;
  }

  const partes = nome.trim().split(/\s+/);
  let alterado = false;

  for (let indice = partes.length - 2; indice >= 0; indice -= 1) {
    const parteOriginal = partes[indice];
    const caracteres = Array.from(parteOriginal.normalize("NFC"));
    if (
      caracteres.length < 2 ||
      parteOriginal.endsWith(".") ||
      PARTICULAS.has(parteOriginal.toLocaleLowerCase("pt-BR"))
    ) {
      continue;
    }

    partes[indice] = `${caracteres[0]}.`;
    const candidato = partes.join(" ");
    const larguraCandidata = medir(candidato);

    // Não substitui uma palavra se a abreviação não economizar espaço.
    if (!Number.isFinite(larguraCandidata) || larguraCandidata >= larguraAtual) {
      partes[indice] = parteOriginal;
      continue;
    }

    alterado = true;
    larguraAtual = larguraCandidata;
    if (larguraAtual <= larguraDisponivel) return candidato;
  }

  // A tela corta visualmente o resultado se ele ainda não couber, sem alterar o nome.
  return alterado ? partes.join(" ") : nome;
}
