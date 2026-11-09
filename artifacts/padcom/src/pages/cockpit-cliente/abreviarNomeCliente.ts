const PARTICULAS = new Set(["da", "das", "de", "do", "dos", "e"]);

/** Altera apenas a apresentação; o último nome e as partículas são preservados. */
export function abreviarNomeCliente(
  nome: string,
  larguraDisponivel: number,
  medir: (texto: string) => number,
): string {
  if (!nome.trim() || !Number.isFinite(larguraDisponivel) || larguraDisponivel <= 0) {
    return nome;
  }

  let larguraAtual = medir(nome);
  if (!Number.isFinite(larguraAtual) || larguraAtual <= larguraDisponivel) return nome;

  const partes = nome.trim().split(/\s+/);
  let alterado = false;
  for (let indice = partes.length - 2; indice >= 0; indice -= 1) {
    const original = partes[indice];
    const caracteres = Array.from(original.normalize("NFC"));
    if (
      caracteres.length < 2 ||
      original.endsWith(".") ||
      PARTICULAS.has(original.toLocaleLowerCase("pt-BR"))
    ) continue;

    partes[indice] = `${caracteres[0]}.`;
    const candidato = partes.join(" ");
    const larguraCandidata = medir(candidato);
    if (!Number.isFinite(larguraCandidata) || larguraCandidata >= larguraAtual) {
      partes[indice] = original;
      continue;
    }
    alterado = true;
    larguraAtual = larguraCandidata;
    if (larguraAtual <= larguraDisponivel) return candidato;
  }
  return alterado ? partes.join(" ") : nome;
}
