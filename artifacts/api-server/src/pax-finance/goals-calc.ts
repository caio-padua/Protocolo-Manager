/** PAX GOALS — calculos puros (sem banco), testaveis. Dinheiro em centavos inteiros. */
export type PeriodType = "month" | "quarter" | "semester" | "year" | "rolling12";
export const PERIOD_TYPES: PeriodType[] = ["month", "quarter", "semester", "year", "rolling12"];

const p2 = (n: number) => String(n).padStart(2, "0");
const addMes = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${p2((t % 12) + 1)}`; };

/** Chave padrao do periodo corrente (hoje = AAAA-MM-DD em Brasilia). */
export function chaveAtual(tipo: PeriodType, hoje: string): string {
  const y = hoje.slice(0, 4), m = Number(hoje.slice(5, 7));
  if (tipo === "year") return y;
  if (tipo === "semester") return `${y}-S${m <= 6 ? 1 : 2}`;
  if (tipo === "quarter") return `${y}-Q${Math.ceil(m / 3)}`;
  if (tipo === "rolling12") return "ROLLING12";
  return hoje.slice(0, 7);
}

export interface Janela { meses: string[]; decorridos: number; total: number }
/** Meses (AAAA-MM) cobertos pelo periodo. Retorna null se a chave nao combina com o tipo. */
export function janela(tipo: PeriodType, chave: string, hoje: string): Janela | null {
  const atual = hoje.slice(0, 7);
  let meses: string[] = [];
  if (tipo === "month") { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(chave)) return null; meses = [chave]; }
  else if (tipo === "year") { if (!/^\d{4}$/.test(chave)) return null; meses = Array.from({ length: 12 }, (_, i) => `${chave}-${p2(i + 1)}`); }
  else if (tipo === "semester") { const m = /^(\d{4})-S([12])$/.exec(chave); if (!m) return null; const o = m[2] === "1" ? 1 : 7; meses = Array.from({ length: 6 }, (_, i) => `${m[1]}-${p2(o + i)}`); }
  else if (tipo === "quarter") { const m = /^(\d{4})-Q([1-4])$/.exec(chave); if (!m) return null; const o = (Number(m[2]) - 1) * 3 + 1; meses = Array.from({ length: 3 }, (_, i) => `${m[1]}-${p2(o + i)}`); }
  else { if (chave !== "ROLLING12") return null; meses = Array.from({ length: 12 }, (_, i) => addMes(atual, i - 11)); }
  const decorridos = tipo === "rolling12" ? 12 : meses.filter((x) => x <= atual).length;
  return { meses, decorridos, total: meses.length };
}

export interface Resumo {
  metaCents: number | null; recebidoCents: number; faltaCents: number | null; pctAtingido: number | null;
  mediaMensalCents: number | null; projecaoFechamentoCents: number | null; diferencaProjecaoCents: number | null;
}
/** Projecao = media dos meses decorridos x meses totais. E estimativa, nunca faturamento realizado. */
export function resumir(metaCents: number | null, recebidoCents: number, j: Janela): Resumo {
  const media = j.decorridos > 0 ? Math.round(recebidoCents / j.decorridos) : null;
  const proj = media === null ? null : media * j.total;
  return {
    metaCents, recebidoCents,
    faltaCents: metaCents === null ? null : Math.max(0, metaCents - recebidoCents),
    pctAtingido: metaCents ? Math.round((recebidoCents / metaCents) * 1000) / 10 : null,
    mediaMensalCents: media, projecaoFechamentoCents: proj,
    diferencaProjecaoCents: metaCents === null || proj === null ? null : proj - metaCents,
  };
}

/** Meses ate atingir `alvoCents` com ganho mensal simulado (arredonda para cima). null se invalido. */
export function mesesAteMeta(alvoCents: number, mensalSimuladoCents: number, jaRecebidoCents = 0): number | null {
  if (!(mensalSimuladoCents > 0) || !(alvoCents > 0)) return null;
  return Math.max(0, Math.ceil((alvoCents - jaRecebidoCents) / mensalSimuladoCents));
}
