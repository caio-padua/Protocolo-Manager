import { z } from "zod";
import { calcularPainel } from "./painel-tributario";
import { VALORES } from "./tributos-catalogo";

/**
 * LABORATÓRIO DE 24 MESES (SIMULAÇÃO PURA). Nada aqui lê ou grava dado real: recebe premissas e devolve números.
 * Dinheiro em centavos inteiros. O imposto vem do mesmo motor do painel tributário (faixas, alíquota efetiva).
 */
export const SELO_LAB = "AMBIENTE DE APRENDIZADO — SIMULAÇÃO — NÃO REPRESENTA FATURAMENTO REAL";
/** Data de constituição da PADUMANN (informada pelo CEO). Meses anteriores NÃO são atribuídos ao CNPJ. */
export const CONSTITUICAO_PADUMANN = "2026-08-13";

const ym = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const c = z.number().int().nonnegative().max(1e12);
export const PremissasInput = z.object({
  inicio: ym,
  faturamentoBaseCents: c, crescimentoMensalPct: z.number().min(-50).max(100), tetoFaturamentoCents: c.nullable(),
  folhaCltCents: c, proLaboreMinimoCents: c, prestadoresPct: z.number().min(0).max(100), rpaContaFatorR: z.boolean(), fatorRAutomatico: z.boolean().default(true),
  despesasFixasCents: c, despesasVariaveisPct: z.number().min(0).max(100), issPct: z.number().min(2).max(5),
  recebimentoNoMesPct: z.number().min(0).max(100), caixaInicialCents: z.number().int().min(-1e12).max(1e12),
  metaMensalCents: c.nullable(),
});
export type Premissas = z.infer<typeof PremissasInput>;
export const OverrideMes = z.object({ faturamentoCents: c.optional(), folhaCltCents: c.optional(), proLaboreCents: c.optional(), despesasCents: c.optional() });
export const OverridesInput = z.record(ym, OverrideMes);
export type Overrides = z.infer<typeof OverridesInput>;

export const FATOR_R_LIMITE = VALORES.simples.fatorRPct;
export function premissasPadrao(hoje = new Date()): Premissas {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() - 12, 1);
  return {
    inicio: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    faturamentoBaseCents: 2_500_000, crescimentoMensalPct: 6, tetoFaturamentoCents: 12_000_000,
    folhaCltCents: 900_000, proLaboreMinimoCents: Math.round(VALORES.inss.salarioMinimo * 100), prestadoresPct: 10, rpaContaFatorR: false, fatorRAutomatico: true,
    despesasFixasCents: 800_000, despesasVariaveisPct: 5, issPct: 3, recebimentoNoMesPct: 60, caixaInicialCents: 0, metaMensalCents: null,
  };
}

export function somaMes(base: string, n: number): string {
  const t = Number(base.slice(0, 4)) * 12 + (Number(base.slice(5, 7)) - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
export function faseDoMes(m: string) {
  const ab = CONSTITUICAO_PADUMANN.slice(0, 7);
  if (m < ab) return { fase: "anterior_abertura" as const, rotulo: "Cenário hipotético anterior à abertura (clínica-modelo genérica, sem CNPJ)" };
  if (m === ab) return { fase: "mes_abertura" as const, rotulo: "Mês da abertura (constituição em 13/08/2026): valores ilustrativos" };
  return { fase: "posterior_abertura" as const, rotulo: "Simulação posterior à abertura (valores ilustrativos, não é faturamento real)" };
}

type Cenario = "sem_planejamento" | "com_planejamento";
interface Linha { chave: string; rotulo: string; valorCents: number }
export interface MesCenario {
  faturamentoCents: number; receitaCompetenciaCents: number; recebimentoCents: number;
  folhaCltCents: number; fgtsCents: number; proLaboreCents: number; prestadoresCents: number; despesasCents: number;
  anexo: "III" | "V"; fatorRPct: number; rbt12Cents: number; rbt12Estimado: boolean; aliquotaEfetivaPct: number | null;
  tributos: Linha[]; tributosCents: number; tributosCompletos: boolean; retencoesSocio: Linha[]; retencoesCents: number;
  resultadoOperacionalCents: number; saldoCaixaCents: number | null;
  lucroContabilCents: null; lucroDistribuivelCents: null; notaLucro: string; pendencias: string[];
}
export interface MesLab { ativo: MesCenario; mes: string; fase: ReturnType<typeof faseDoMes>; dentroDaJanela: boolean; meta: number | null; sem: MesCenario; com: MesCenario }

const NOTA_LUCRO = "Lucro contábil e lucro distribuível só existem com contabilidade completa (balanço, despesas e ajustes). Aqui aparece só o resultado operacional estimado.";

function rodar(p: Premissas, ov: Overrides, cen: Cenario) {
  const out = new Map<string, MesCenario>();
  const hist: { fat: number; folha: number }[] = [];
  let caixa = p.caixaInicialCents; let tribAnterior = 0; let fatAnterior: number | null = null;
  for (let i = -12; i < 24; i++) {
    const m = somaMes(p.inicio, i); const o = ov[m] ?? {};
    const cresc = Math.pow(1 + p.crescimentoMensalPct / 100, i);
    let fat = o.faturamentoCents ?? Math.round(p.faturamentoBaseCents * cresc);
    if (o.faturamentoCents === undefined && p.tetoFaturamentoCents !== null) fat = Math.min(fat, p.tetoFaturamentoCents);
    const folhaClt = o.folhaCltCents ?? p.folhaCltCents; const fgts = Math.round((folhaClt * VALORES.folha.fgts) / 100);
    const prest = Math.round((fat * p.prestadoresPct) / 100); const desp = o.despesasCents ?? (p.despesasFixasCents + Math.round((fat * p.despesasVariaveisPct) / 100));
    const n = Math.min(12, hist.length);
    const estimado = n < 12;
    const somaFat = hist.slice(-12).reduce((a, h) => a + h.fat, 0);
    const rbt12 = n === 0 ? fat * 12 : estimado ? Math.round((somaFat / n) * 12) : somaFat;
    const rpaElegivel = (fv: number) => (p.rpaContaFatorR ? Math.round((fv * p.prestadoresPct) / 100) : 0);

    const calc = (pl: number) => {
      const folhaMes = folhaClt + fgts + pl + rpaElegivel(fat);
      const somaFolha = hist.slice(-12).reduce((a, h) => a + h.folha, 0);
      const fr = n === 0 ? (fat > 0 ? (folhaMes / fat) * 100 : 0) : somaFat > 0 ? (somaFolha / somaFat) * 100 : 0;
      const anexo: "III" | "V" = fr >= FATOR_R_LIMITE ? "III" : "V";
      const res = calcularPainel({ faturamentoMensalCents: fat, rbt12Cents: rbt12, folhaMensalCents: folhaClt, proLaboreMensalCents: pl, despesasMensaisCents: desp, issAliquotaPct: p.issPct, anexo });
      const reg = res.regimes.find((r) => r.key === (anexo === "III" ? "simples_iii" : "simples_v"))!;
      const trib = reg.linhas.filter((l) => l.soma && l.valorCents !== null).map((l) => ({ chave: l.chave, rotulo: l.rotulo, valorCents: l.valorCents as number }));
      const ret = res.socio.linhas.filter((l) => l.soma && l.valorCents !== null).map((l) => ({ chave: l.chave, rotulo: l.rotulo, valorCents: l.valorCents as number }));
      const t = trib.reduce((a, l) => a + l.valorCents, 0), r = ret.reduce((a, l) => a + l.valorCents, 0);
      const efetiva = rbt12 > 0 ? ((t / Math.max(fat, 1)) * 100) : null;
      return { folhaMes, fr, anexo, trib, ret, t, r, completo: reg.completo, efetiva, pend: reg.pendencias };
    };
    const minPl = o.proLaboreCents ?? p.proLaboreMinimoCents;
    let pl = minPl;
    if (cen === "com_planejamento" && fat > 0) {
      // Política do planejamento: manter a folha elegível em 28% da receita MÊS A MÊS, porque o Fator R usa os 12 meses anteriores.
      const alvoFolha = Math.ceil((fat * FATOR_R_LIMITE) / 100);
      const plAlvo = Math.max(minPl, alvoFolha - folhaClt - fgts - rpaElegivel(fat));
      if (plAlvo <= fat * 0.6) pl = plAlvo;
    }
    const r = calc(pl);
    const rec = Math.round((fat * p.recebimentoNoMesPct) / 100) + (fatAnterior === null ? 0 : Math.round((fatAnterior * (100 - p.recebimentoNoMesPct)) / 100));
    const resultado = fat - r.t - folhaClt - fgts - pl - prest - desp;
    let saldo: number | null = null;
    if (i >= 0) {
      caixa += rec - (folhaClt + fgts + pl + prest + desp + tribAnterior);
      saldo = caixa;
    }
    out.set(m, {
      faturamentoCents: fat, receitaCompetenciaCents: fat, recebimentoCents: rec, folhaCltCents: folhaClt, fgtsCents: fgts, proLaboreCents: pl, prestadoresCents: prest, despesasCents: desp,
      anexo: r.anexo, fatorRPct: Math.round(r.fr * 100) / 100, rbt12Cents: rbt12, rbt12Estimado: estimado, aliquotaEfetivaPct: r.efetiva !== null ? Math.round(r.efetiva * 100) / 100 : null,
      tributos: r.trib, tributosCents: r.t, tributosCompletos: r.completo, retencoesSocio: r.ret, retencoesCents: r.r,
      resultadoOperacionalCents: resultado, saldoCaixaCents: saldo, lucroContabilCents: null, lucroDistribuivelCents: null, notaLucro: NOTA_LUCRO,
      pendencias: [...r.pend, ...(estimado ? ["RBT12 estimada pela média dos meses disponíveis (início de atividade)."] : [])],
    });
    hist.push({ fat, folha: r.folhaMes });
    tribAnterior = r.t; fatAnterior = fat;
  }
  return out;
}

export function calcularLab(p: Premissas, ov: Overrides = {}) {
  const sem = rodar(p, ov, "sem_planejamento"), com = rodar(p, ov, "com_planejamento");
  const meses: MesLab[] = Array.from({ length: 24 }, (_, i) => {
    const m = somaMes(p.inicio, i);
    const s = sem.get(m)!, cm = com.get(m)!;
    return { mes: m, fase: faseDoMes(m), dentroDaJanela: true, meta: p.metaMensalCents, sem: s, com: cm, ativo: p.fatorRAutomatico ? cm : s };
  });
  const soma = (f: (x: MesCenario) => number, k: "sem" | "com") => meses.reduce((a, x) => a + f(x[k]), 0);
  const tot = (k: "sem" | "com") => ({
    faturamentoCents: soma((x) => x.faturamentoCents, k), recebimentoCents: soma((x) => x.recebimentoCents, k), tributosCents: soma((x) => x.tributosCents, k),
    retencoesCents: soma((x) => x.retencoesCents, k), folhaCents: soma((x) => x.folhaCltCents + x.fgtsCents, k), proLaboreCents: soma((x) => x.proLaboreCents, k),
    resultadoOperacionalCents: soma((x) => x.resultadoOperacionalCents, k), saldoFinalCaixaCents: meses[23][k].saldoCaixaCents,
  });
  const ts = tot("sem"), tc = tot("com");
  const mesesMeta = p.metaMensalCents === null ? null : meses.filter((x) => x.sem.faturamentoCents >= (p.metaMensalCents as number)).length;
  return {
    isSimulation: true as const, selo: SELO_LAB, constituicaoPadumann: CONSTITUICAO_PADUMANN, premissas: p, overrides: ov, meses,
    totais: { sem_planejamento: ts, com_planejamento: tc, economiaCargaCents: ts.tributosCents + ts.retencoesCents - (tc.tributosCents + tc.retencoesCents) },
    mesesComMetaAtingida: mesesMeta,
    avisos: [
      "Meses anteriores a 13/08/2026 não pertencem à PADUMANN: são de uma clínica-modelo genérica, sem CNPJ.",
      "Nenhuma receita é atribuída à empresa de Carlúcia: ela é só um cadastro em andamento, sem CNPJ.",
      "Folha elegível do Fator R = folha de CLT + FGTS + pró-labore. Pagamento a prestador (RPA) só entra se você marcar; a regra exige validação do contador.",
      "Retenção de INSS e IRRF sobre prestadores (RPA) não é calculada nesta simulação.",
      NOTA_LUCRO,
    ],
  };
}
export type LabResultado = ReturnType<typeof calcularLab>;
