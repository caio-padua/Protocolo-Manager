/** Validacao matematica (digitos verificadores) de CNPJ. Nao prova que o CNPJ existe na Receita. */
export function cnpjValido(valor: string | null | undefined): boolean {
  const d = (valor ?? "").replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dig = (base: string, pesos: number[]) => {
    const soma = base.split("").reduce((s, c, i) => s + Number(c) * pesos[i]!, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, ...p1];
  return dig(d.slice(0, 12), p1) === Number(d[12]) && dig(d.slice(0, 13), p2) === Number(d[13]);
}
