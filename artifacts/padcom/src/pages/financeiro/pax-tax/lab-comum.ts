/** Tipos e formatadores do Laboratório de 24 meses (simulação). */
export type Linha = { chave: string; rotulo: string; valorCents: number };
export type Cen = {
  faturamentoCents: number; recebimentoCents: number; folhaCltCents: number; fgtsCents: number; proLaboreCents: number; prestadoresCents: number; despesasCents: number;
  anexo: "III" | "V"; fatorRPct: number; rbt12Cents: number; rbt12Estimado: boolean; aliquotaEfetivaPct: number | null;
  tributos: Linha[]; tributosCents: number; retencoesSocio: Linha[]; retencoesCents: number; resultadoOperacionalCents: number; saldoCaixaCents: number | null; notaLucro: string; pendencias: string[];
};
export type Mes = { ativo: Cen; mes: string; fase: { fase: string; rotulo: string }; sem: Cen; com: Cen };
export type Prem = {
  inicio: string; faturamentoBaseCents: number; crescimentoMensalPct: number; tetoFaturamentoCents: number | null; folhaCltCents: number; proLaboreMinimoCents: number;
  prestadoresPct: number; rpaContaFatorR: boolean; fatorRAutomatico: boolean; despesasFixasCents: number; despesasVariaveisPct: number; issPct: number; recebimentoNoMesPct: number; caixaInicialCents: number; metaMensalCents: number | null;
};
export type Ov = Record<string, { faturamentoCents?: number; folhaCltCents?: number; proLaboreCents?: number; despesasCents?: number }>;
export type Lab = {
  selo: string; origemPremissas: string; salvo: boolean; premissas: Prem; overrides: Ov; meses: Mes[]; avisos: string[];
  totais: { sem_planejamento: Tot; com_planejamento: Tot; economiaCargaCents: number };
};
export type Tot = { faturamentoCents: number; recebimentoCents: number; tributosCents: number; retencoesCents: number; resultadoOperacionalCents: number; saldoFinalCaixaCents: number | null };

export const fmt = (c: number | null) => (c === null ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);
