// Helpers de dinheiro: armazenamos SEMPRE centavos inteiros no back-end.
// fmt: centavos -> "R$ 1.234,56". reais<->centavos para inputs em reais.

export function fmt(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function centsToReais(cents: number): number {
  return Math.round(cents) / 100;
}

export function reaisToCents(reais: number | string): number {
  const n = typeof reais === "string" ? parseFloat(reais.replace(/\./g, "").replace(",", ".")) : reais;
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function pct(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}
