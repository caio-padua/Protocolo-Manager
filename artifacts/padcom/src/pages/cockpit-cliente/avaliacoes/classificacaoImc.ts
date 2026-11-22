/** Referência geral para adultos, baseada nas diretrizes do Health Canada alinhadas à OMS. */
export const FAIXAS_IMC = [
  { key: "baixo", name: "Baixo peso", color: "#1e40af", low: null, high: 18.5, texto: "Abaixo de 18,5" },
  { key: "normal", name: "Faixa normal", color: "#15803d", low: 18.5, high: 25, texto: "De 18,5 até menos de 25" },
  { key: "sobrepeso", name: "Sobrepeso", color: "#b66a00", low: 25, high: 30, texto: "De 25 até menos de 30" },
  { key: "obesidade1", name: "Obesidade grau I", color: "#c55a11", low: 30, high: 35, texto: "De 30 até menos de 35" },
  { key: "obesidade2", name: "Obesidade grau II", color: "#c12626", low: 35, high: 40, texto: "De 35 até menos de 40" },
  { key: "obesidade3", name: "Obesidade grau III", color: "#84224b", low: 40, high: null, texto: "40 ou mais" },
] as const;

export function faixaImc(valor: number) {
  if (!Number.isFinite(valor) || valor <= 0) return null;
  return FAIXAS_IMC.find((f) => (f.low === null || valor >= f.low) && (f.high === null || valor < f.high)) ?? null;
}

/** Não arredondar um resultado para dentro de uma faixa diferente da real. */
export function formatarImc(valor: number): string {
  const faixa = faixaImc(valor)?.key;
  for (let casas = 1; casas <= 12; casas++) {
    const arredondado = Number(valor.toFixed(casas));
    if (faixaImc(arredondado)?.key === faixa) {
      return valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: casas });
    }
  }
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 15 });
}

function dataCivil(valor: string | null | undefined): string | null {
  const m = valor?.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (!m) return null;
  const ano = Number(m[1]), mes = Number(m[2]), dia = Number(m[3]);
  const dt = new Date(0);
  dt.setUTCHours(0, 0, 0, 0);
  dt.setUTCFullYear(ano, mes - 1, dia);
  if (ano < 1 || dt.getUTCFullYear() !== ano || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== dia) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function idadeAdultaNaMedicao(nascimento: string | null | undefined, medicao: string): boolean {
  const n = dataCivil(nascimento), m = dataCivil(medicao);
  if (!n || !m || m < n) return false;
  const ano18 = Number(n.slice(0, 4)) + 18;
  // Para quem nasceu em 29 de fevereiro, considera o aniversário em 1º de março nos anos não bissextos.
  const aniversario = `${String(ano18).padStart(4, "0")}${n.slice(4)}`;
  const limite = dataCivil(aniversario) ?? `${ano18}-03-01`;
  return m >= limite;
}
