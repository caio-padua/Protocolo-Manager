/**
 * Nome padrão da receita no Drive e no download:
 *   AA.MM.DD RECEITA MANIPULADA NOME DO CLIENTE
 * Ano com 2 dígitos, nome em maiúsculas e sem acento, e NADA depois do nome (sem número, sem colchetes).
 * A extensão ".pdf" é acrescentada por quem grava o arquivo.
 */
export function nomeArquivoReceita(
  dataISO: string | null | undefined,
  clienteNome: string,
  recipeType?: string | null,
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dataISO ?? "");
  if (!m) throw new Error("Data da receita ausente ou inválida; o nome do arquivo não pode ser montado.");
  const nome = clienteNome
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
  if (!nome) throw new Error("Cliente sem nome; o nome do arquivo não pode ser montado.");
  const tipo = recipeType === "controlado_isolado" ? "RECEITA CONTROLADA" : "RECEITA MANIPULADA";
  return `${m[1].slice(2)}.${m[2]}.${m[3]} ${tipo} ${nome}`;
}

/** Escolhe um nome livre na pasta: o padrão puro primeiro; se já existir outra receita igual no dia, "(2)", "(3)"… */
export function nomeLivreNaPasta(base: string, existentes: Iterable<string>): string {
  const usados = new Set(existentes);
  if (!usados.has(`${base}.pdf`)) return `${base}.pdf`;
  for (let n = 2; n < 1000; n++) if (!usados.has(`${base} (${n}).pdf`)) return `${base} (${n}).pdf`;
  throw new Error("Muitos arquivos com o mesmo nome na pasta.");
}
