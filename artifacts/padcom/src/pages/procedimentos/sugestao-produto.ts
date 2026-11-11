/** Sugere o nome do ato sem transportar dose ou apresentação do produto. */
export function nomeSugeridoProduto(nome: string): string {
  return nome
    .replace(/\s*[-–—:|,]?\s*\d+(?:[.,]\d+)*\s*(?:mg|mcg|µg|μg|ug|g|ui|iu|ml|mililitros?|ampolas?)\b/gi, "")
    .replace(/\s*\d+(?:[.,]\d+)?\s*%/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s*[-–—|:;,/]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Só uma dose simples, sem volume, razão ou mistura, pode ser sugerida. */
export function doseSeguraProduto(dose: string | null | undefined): string | null {
  const valor = dose?.trim() ?? "";
  return /^\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|μg|ug|g|ui|iu)$/i.test(valor) ? valor : null;
}

/** A duração deve ser representável em segundos inteiros, sem arredondamento. */
export function duracaoValidaMinutos(valor: number): boolean {
  if (!Number.isFinite(valor) || valor < 1 / 60 || valor > 1440) return false;
  const segundos = valor * 60;
  return Math.abs(segundos - Math.round(segundos)) < 1e-7;
}
