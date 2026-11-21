import { z } from "zod";
import { CONFERENCIA, CONSULTADO_EM, EXPLICACOES, FONTES, REGIMES_TEXTO, VALORES, type FonteKey } from "./tributos-catalogo";

/**
 * Painel tributário (SIMULAÇÃO). Dinheiro em centavos inteiros; percentuais em %.
 * Cálculo no servidor: a tela só exibe. Sem dado informado a linha fica VAZIA com o motivo (nunca número inventado).
 */
const cents = z.number().int().nonnegative().max(1e13).nullable().optional();
export const PainelInput = z.object({
  faturamentoMensalCents: cents, rbt12Cents: cents, folhaMensalCents: cents, proLaboreMensalCents: cents,
  despesasMensaisCents: cents, distribuicaoLucrosMensalCents: cents,
  issAliquotaPct: z.number().min(0).max(100).nullable().optional(),
  ratPct: z.number().min(0).max(100).nullable().optional(),
  terceirosPct: z.number().min(0).max(100).nullable().optional(),
  hospitalar: z.boolean().optional(),
  anexo: z.enum(["III", "V"]).nullable().optional(),
});
export type PainelInputT = z.infer<typeof PainelInput>;

export type EstadoLinha = "calculado" | "vazio" | "informativo" | "nao_se_aplica";
export interface Linha {
  chave: string; rotulo: string; sigla: string; valorCents: number | null; pct: number | null; estado: EstadoLinha; soma: boolean;
  motivo: string | null; detalhe: string | null;
  explicacao: { oQueE: string; quemPaga: string; comoCalcula: string; fontes: { nome: string; url: string }[] };
}
export interface RegimeResultado {
  key: "simples_iii" | "simples_v" | "presumido" | "real"; nome: string; texto: string; disponivel: boolean; motivoIndisponivel: string | null; completo: boolean;
  linhas: Linha[]; subtotalCents: number | null; subtotalPct: number | null; liquidoCents: number | null; pendencias: string[]; memoria: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pctTxt = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;

function linha(chave: string, fat: number, valor: number | null, o: { estado?: EstadoLinha; soma?: boolean; motivo?: string; detalhe?: string; rotuloExtra?: string } = {}): Linha {
  const ex = EXPLICACOES[chave];
  const estado: EstadoLinha = o.estado ?? (valor === null ? "vazio" : "calculado");
  return {
    chave, rotulo: ex.nome, sigla: ex.sigla, valorCents: valor, pct: valor !== null && fat > 0 ? r2((valor / fat) * 100) : null, estado,
    soma: (o.soma ?? true) && estado === "calculado", motivo: o.motivo ?? null, detalhe: o.detalhe ?? null,
    explicacao: { oQueE: ex.oQueE, quemPaga: ex.quemPaga, comoCalcula: ex.comoCalcula, fontes: ex.fontes.map((f: FonteKey) => ({ nome: FONTES[f].nome, url: FONTES[f].url })) },
  };
}
const SEM_FAT = "Digite o faturamento mensal para calcular.";

function folhaLinhas(i: PainelInputT, fat: number, naoSimples: boolean): { linhas: Linha[]; pend: string[]; memo: string[] } {
  const folha = i.folhaMensalCents ?? null, pl = i.proLaboreMensalCents ?? null;
  const L: Linha[] = []; const pend: string[] = []; const memo: string[] = [];
  if (!naoSimples) return { linhas: L, pend, memo };
  if (fat <= 0) { for (const k of ["CPP", "RAT", "TERCEIROS"]) L.push(linha(k, fat, null, { motivo: SEM_FAT })); L.push(linha("FGTS", fat, null, { estado: "vazio", soma: false, motivo: SEM_FAT })); return { linhas: L, pend, memo }; }
  if (folha === null && pl === null) {
    L.push(linha("CPP", fat, null, { motivo: "Informe a folha dos empregados e/ou o pró-labore dos sócios. Sem folha e sem pró-labore, não há INSS patronal." })); pend.push("INSS patronal: informe folha ou pró-labore");
  } else {
    const base = (folha ?? 0) + (pl ?? 0); const v = Math.round((base * VALORES.folha.patronal) / 100);
    L.push(linha("CPP", fat, v, { detalhe: `20% sobre ${brl(base)} (folha + pró-labore)` })); memo.push(`INSS patronal = 20% x ${brl(base)} = ${brl(v)}`);
  }
  const semEmp = "Nenhuma folha de empregados informada: sem empregados esta linha não se aplica. Se houver empregados, informe a folha mensal.";
  if (folha === null) L.push(linha("RAT", fat, null, { estado: "nao_se_aplica", motivo: semEmp }));
  else if (i.ratPct == null) { L.push(linha("RAT", fat, null, { motivo: "Informe o grau de risco da atividade: 1%, 2% ou 3% (depende do CNAE; peça ao contador). O sistema não escolhe por você." })); pend.push("RAT: informe a alíquota (1, 2 ou 3%)"); }
  else { const v = Math.round((folha * i.ratPct) / 100); L.push(linha("RAT", fat, v, { detalhe: `${pctTxt(i.ratPct)} sobre ${brl(folha)}` })); }
  if (folha === null) L.push(linha("TERCEIROS", fat, null, { estado: "nao_se_aplica", motivo: semEmp }));
  else if (i.terceirosPct == null) { L.push(linha("TERCEIROS", fat, null, { motivo: "Informe a alíquota de terceiros do seu enquadramento (FPAS). Ela varia e o sistema não inventa." })); pend.push("Terceiros: informe a alíquota"); }
  else { const v = Math.round((folha * i.terceirosPct) / 100); L.push(linha("TERCEIROS", fat, v, { detalhe: `${pctTxt(i.terceirosPct)} sobre ${brl(folha)}` })); }
  if (folha === null) L.push(linha("FGTS", fat, null, { estado: "nao_se_aplica", soma: false, motivo: semEmp }));
  else L.push(linha("FGTS", fat, Math.round((folha * VALORES.folha.fgts) / 100), { estado: "informativo", soma: false, detalhe: "Custo da folha, não é imposto: não entra no total de impostos." }));
  return { linhas: L, pend, memo };
}

function issLinha(i: PainelInputT, fat: number): { l: Linha; pend: string[] } {
  if (fat <= 0) return { l: linha("ISS", fat, null, { motivo: SEM_FAT }), pend: [] };
  if (i.issAliquotaPct == null) return { l: linha("ISS", fat, null, { motivo: "Informe a alíquota de ISS do seu município (a lei federal permite de 2% a 5% para medicina). Sem a cidade, o sistema não escolhe." }), pend: ["ISS: informe a alíquota do município"] };
  const v = Math.round((fat * i.issAliquotaPct) / 100);
  const fora = i.issAliquotaPct < VALORES.iss.minimo || i.issAliquotaPct > VALORES.iss.maximo;
  return { l: linha("ISS", fat, v, { detalhe: `${pctTxt(i.issAliquotaPct)} sobre o faturamento${fora ? ` (atenção: fora da faixa legal de ${VALORES.iss.minimo}% a ${VALORES.iss.maximo}%)` : ""}` }), pend: [] };
}

function fechar(r: Omit<RegimeResultado, "subtotalCents" | "subtotalPct" | "liquidoCents" | "completo">, fat: number): RegimeResultado {
  const faltam = r.linhas.some((l) => l.estado === "vazio" && l.chave !== "FGTS");
  const completo = r.disponivel && fat > 0 && !faltam;
  const sub = fat > 0 && r.disponivel ? r.linhas.filter((l) => l.soma).reduce((a, l) => a + (l.valorCents ?? 0), 0) : null;
  return { ...r, completo, subtotalCents: sub, subtotalPct: sub !== null && fat > 0 ? r2((sub / fat) * 100) : null, liquidoCents: sub !== null ? fat - sub : null };
}

export function simplesRegime(anexo: "III" | "V", i: PainelInputT, fat: number, rbt12: number, rbtEstimado: boolean): RegimeResultado {
  const key = anexo === "III" ? "simples_iii" : "simples_v";
  const nome = `Simples Nacional, Anexo ${anexo}`;
  const base = { key, nome, texto: REGIMES_TEXTO.simples } as const;
  const tabela = anexo === "III" ? VALORES.simples.anexoIII : VALORES.simples.anexoV;
  const repart = anexo === "III" ? VALORES.simples.reparticaoIII : VALORES.simples.reparticaoV;
  const chaves = ["SIMPLES_IRPJ", "SIMPLES_CSLL", "SIMPLES_COFINS", "SIMPLES_PIS", "SIMPLES_CPP", "SIMPLES_ISS"] as const;
  const vazias = (motivo: string) => chaves.map((k) => linha(k, fat, null, { motivo }));
  const cbs = linha("CBS_IBS", fat, null, { estado: "nao_se_aplica", soma: false, motivo: "Optante do Simples não recolhe CBS/IBS em 2026 (LC 214/2025, art. 348, III, c)." });
  if (rbt12 > VALORES.simples.limiteEPP * 100) return fechar({ ...base, disponivel: false, motivoIndisponivel: `Receita dos 12 meses (${brl(rbt12)}) acima do limite do Simples (R$ 4.800.000,00).`, linhas: [...vazias("Fora do limite do Simples."), cbs], pendencias: [], memoria: [] }, fat);
  if (fat <= 0 || rbt12 <= 0) return fechar({ ...base, disponivel: true, motivoIndisponivel: null, linhas: [...vazias(SEM_FAT), cbs], pendencias: [SEM_FAT], memoria: [] }, fat);
  const idx = tabela.findIndex((f) => rbt12 <= f.ate * 100);
  const f = tabela[idx];
  const efetiva = (rbt12 * (f.aliq / 100) - f.pd * 100) / rbt12; // fração
  const memo = [`Receita dos 12 meses (RBT12): ${brl(rbt12)}${rbtEstimado ? " (estimada: faturamento do mês x 12)" : ""}`, `Faixa ${idx + 1}: alíquota nominal ${pctTxt(f.aliq)}, parcela a deduzir ${brl(f.pd * 100)}`, `Alíquota efetiva = (RBT12 x ${pctTxt(f.aliq)} - ${brl(f.pd * 100)}) / RBT12 = ${pctTxt(efetiva * 100)}`];
  let partes: number[]; // IRPJ, CSLL, COFINS, PIS, CPP, ISS em centavos
  let nota: string | null = null;
  if (anexo === "III" && idx === 4 && efetiva * 100 > VALORES.simples.iss5Limite) {
    const o = efetiva - 0.05; const s = VALORES.simples.iss5Repart;
    partes = [...s.map((x) => Math.round(fat * o * (x / 100))), Math.round(fat * 0.05)];
    // ordem da regra: IRPJ, CSLL, COFINS, PIS, CPP, depois ISS fixo de 5%
    nota = "Faixa 5 do Anexo III com alíquota efetiva acima de 14,92537%: o ISS fica em 5% e o restante é repartido pela tabela especial.";
  } else {
    const rp = repart[idx]; partes = rp.map((x) => Math.round(fat * efetiva * (x / 100)));
  }
  memo.push(`DAS do mês = faturamento ${brl(fat)} x alíquota efetiva`);
  if (nota) memo.push(nota);
  const linhas: Linha[] = chaves.map((k, n) => linha(k, fat, partes[n]));
  const pend: string[] = [];
  if (idx === 5) { // faixa 6: ISS fora do DAS
    const iss = issLinha(i, fat); linhas[5] = { ...iss.l, chave: "SIMPLES_ISS", detalhe: "Acima de R$ 3,6 milhões o ISS é recolhido fora do DAS, pela lei do município. " + (iss.l.detalhe ?? "") }; pend.push(...iss.pend);
  }
  linhas.push(cbs);
  if (i.folhaMensalCents != null) linhas.push(linha("FGTS", fat, Math.round((i.folhaMensalCents * VALORES.folha.fgts) / 100), { estado: "informativo", soma: false, detalhe: "Custo da folha, não é imposto: não entra no total de impostos." }));
  else linhas.push(linha("FGTS", fat, null, { estado: "nao_se_aplica", soma: false, motivo: "Nenhuma folha de empregados informada: sem empregados esta linha não se aplica." }));
  return fechar({ ...base, disponivel: true, motivoIndisponivel: null, linhas, pendencias: pend, memoria: memo }, fat);
}

export function presumidoRegime(i: PainelInputT, fat: number, rbt12: number): RegimeResultado {
  const P = VALORES.presumido; const hosp = !!i.hospitalar;
  const base = { key: "presumido", nome: "Lucro Presumido", texto: REGIMES_TEXTO.presumido } as const;
  const cb = linha("CBS_IBS", fat, fat > 0 ? Math.round((fat * (VALORES.reforma2026.cbs + VALORES.reforma2026.ibs)) / 100) : null, { estado: fat > 0 ? "informativo" : "vazio", soma: false, motivo: fat > 0 ? undefined : SEM_FAT, detalhe: "Teste de 2026: compensado com PIS/COFINS; não soma no total." });
  if (fat <= 0) {
    const ks = ["IRPJ", "IRPJ_ADICIONAL", "CSLL", "PIS_CUM", "COFINS_CUM"]; const ls = ks.map((k) => linha(k, fat, null, { motivo: SEM_FAT }));
    const iss = issLinha(i, fat); const fl = folhaLinhas(i, fat, true);
    return fechar({ ...base, disponivel: true, motivoIndisponivel: null, linhas: [...ls, iss.l, ...fl.linhas, cb], pendencias: [SEM_FAT], memoria: [] }, fat);
  }
  const anual = Math.max(rbt12, fat * 12);
  const excesso = Math.max(0, anual - P.acrescimoLc224Limite * 100);
  const fator = 1 + (P.acrescimoLc224 / 100) * (excesso / anual);
  const pI = (hosp ? P.presuncaoHospitalar : P.presuncaoServicos), pC = (hosp ? P.csllHospitalar : P.csllServicos);
  const baseI = Math.round(fat * (pI / 100) * fator), baseC = Math.round(fat * (pC / 100) * fator);
  const memo = [
    `Percentual de presunção do IRPJ: ${pctTxt(pI)} (${hosp ? "serviços hospitalares / auxílio diagnóstico" : "serviços em geral, inclui consultas médicas"}); da CSLL: ${pctTxt(pC)}`,
    excesso > 0 ? `Receita anual estimada ${brl(anual)} passa de R$ 5.000.000,00: acréscimo de 10% na presunção sobre o excesso, fator ${fator.toFixed(6)}` : "Receita anual até R$ 5.000.000,00: sem acréscimo de 10% na presunção (LC 224/2025).",
    `Base do IRPJ = ${brl(fat)} x ${pctTxt(pI)} = ${brl(baseI)}; base da CSLL = ${brl(baseC)}`,
  ];
  const adBase = Math.max(0, baseI - P.adicionalLimiteMensal * 100);
  const linhas: Linha[] = [
    linha("IRPJ", fat, Math.round((baseI * P.irpj) / 100), { detalhe: `15% sobre a base presumida de ${brl(baseI)}` }),
    linha("IRPJ_ADICIONAL", fat, Math.round((adBase * P.adicional) / 100), { detalhe: adBase > 0 ? `10% sobre ${brl(adBase)} (parte da base acima de R$ 20.000,00 no mês)` : "Base presumida abaixo de R$ 20.000,00 no mês: sem adicional." }),
    linha("CSLL", fat, Math.round((baseC * P.csll) / 100), { detalhe: `9% sobre a base presumida de ${brl(baseC)}` }),
    linha("PIS_CUM", fat, Math.round((fat * P.pis) / 100), { detalhe: "0,65% sobre o faturamento" }),
    linha("COFINS_CUM", fat, Math.round((fat * P.cofins) / 100), { detalhe: "3% sobre o faturamento" }),
  ];
  const iss = issLinha(i, fat); linhas.push(iss.l);
  const fl = folhaLinhas(i, fat, true); linhas.push(...fl.linhas, cb);
  return fechar({ ...base, disponivel: true, motivoIndisponivel: null, linhas, pendencias: [...iss.pend, ...fl.pend], memoria: [...memo, ...fl.memo] }, fat);
}

export function realRegime(i: PainelInputT, fat: number): RegimeResultado {
  const R = VALORES.real; const base = { key: "real", nome: "Lucro Real", texto: REGIMES_TEXTO.real } as const;
  const cb = linha("CBS_IBS", fat, fat > 0 ? Math.round((fat * (VALORES.reforma2026.cbs + VALORES.reforma2026.ibs)) / 100) : null, { estado: fat > 0 ? "informativo" : "vazio", soma: false, motivo: fat > 0 ? undefined : SEM_FAT, detalhe: "Teste de 2026: compensado com PIS/COFINS; não soma no total." });
  const desp = i.despesasMensaisCents ?? null;
  const memo: string[] = []; const pend: string[] = [];
  const semDesp = "Informe as despesas dedutíveis do mês. O Lucro Real cobra sobre o lucro de verdade (faturamento menos despesas); sem despesas o sistema não inventa o lucro.";
  let ir: Linha, ad: Linha, cs: Linha;
  if (fat <= 0) { ir = linha("IRPJ", fat, null, { motivo: SEM_FAT }); ad = linha("IRPJ_ADICIONAL", fat, null, { motivo: SEM_FAT }); cs = linha("CSLL", fat, null, { motivo: SEM_FAT }); }
  else if (desp === null) { ir = linha("IRPJ", fat, null, { motivo: semDesp }); ad = linha("IRPJ_ADICIONAL", fat, null, { motivo: semDesp }); cs = linha("CSLL", fat, null, { motivo: semDesp }); pend.push("Lucro Real: informe as despesas dedutíveis"); }
  else {
    const lucro = Math.max(0, fat - desp); memo.push(`Lucro do mês = ${brl(fat)} - despesas ${brl(desp)} = ${brl(lucro)}${fat < desp ? " (prejuízo: sem imposto de renda no mês)" : ""}`);
    ir = linha("IRPJ", fat, Math.round((lucro * R.irpj) / 100), { detalhe: `15% sobre o lucro de ${brl(lucro)}` });
    const adb = Math.max(0, lucro - R.adicionalLimiteMensal * 100); ad = linha("IRPJ_ADICIONAL", fat, Math.round((adb * R.adicional) / 100), { detalhe: adb > 0 ? `10% sobre ${brl(adb)}` : "Lucro abaixo de R$ 20.000,00 no mês: sem adicional." });
    cs = linha("CSLL", fat, Math.round((lucro * R.csll) / 100), { detalhe: `9% sobre o lucro de ${brl(lucro)}` });
  }
  const pis = linha("PIS_NC", fat, fat > 0 ? Math.round((fat * R.pis) / 100) : null, { motivo: fat > 0 ? undefined : SEM_FAT, detalhe: "1,65% sobre o faturamento, sem créditos (valor máximo)" });
  const cof = linha("COFINS_NC", fat, fat > 0 ? Math.round((fat * R.cofins) / 100) : null, { motivo: fat > 0 ? undefined : SEM_FAT, detalhe: "7,6% sobre o faturamento, sem créditos (valor máximo)" });
  const iss = issLinha(i, fat); const fl = folhaLinhas(i, fat, true);
  return fechar({ ...base, disponivel: true, motivoIndisponivel: null, linhas: [ir, ad, cs, pis, cof, iss.l, ...fl.linhas, cb], pendencias: [...pend, ...iss.pend, ...fl.pend], memoria: [...memo, ...fl.memo] }, fat);
}

export function irrfProLabore(plCents: number): { inss: number; irrf: number; memo: string[] } {
  const I = VALORES.inss, T = VALORES.irrf; const pl = plCents / 100;
  const inss = Math.round(Math.min(pl, I.teto) * I.aliquotaSocio) / 100; // reais
  const ded = Math.max(inss, T.simplificada); const baseIr = Math.max(0, pl - ded);
  const f = T.faixas.find((x) => baseIr <= x.ate)!; let imp = Math.max(0, baseIr * (f.aliq / 100) - f.ded);
  let red = 0;
  if (pl <= T.limiteIsento) red = Math.min(imp, T.reducaoAte5000);
  else if (pl <= T.limiteReducao) red = Math.min(imp, Math.max(0, T.reducaoA - T.reducaoB * pl));
  imp = Math.max(0, imp - red);
  const m = [`INSS do sócio = 11% sobre ${brl(Math.round(Math.min(pl, I.teto) * 100))} (teto R$ 8.475,55) = ${brl(Math.round(inss * 100))}`, `Dedução usada no IRRF: ${brl(Math.round(ded * 100))} (o maior entre o INSS e a dedução simplificada de R$ 607,20)`, `Base do IRRF ${brl(Math.round(baseIr * 100))}; alíquota ${pctTxt(f.aliq)}; redução legal ${brl(Math.round(red * 100))}`];
  return { inss: Math.round(inss * 100), irrf: Math.round(imp * 100), memo: m };
}

export function socioLinhas(i: PainelInputT, fat: number): { linhas: Linha[]; memo: string[] } {
  const pl = i.proLaboreMensalCents ?? null; const L: Linha[] = []; let memo: string[] = [];
  if (pl === null || pl <= 0) {
    const m = "Informe o pró-labore mensal do sócio. Sem pró-labore, não há INSS nem IRRF do sócio.";
    L.push(linha("INSS_SOCIO", fat, null, { motivo: m }), linha("IRRF_PROLABORE", fat, null, { motivo: m }));
  } else { const x = irrfProLabore(pl); memo = x.memo; L.push(linha("INSS_SOCIO", fat, x.inss, { detalhe: "11% do pró-labore até o teto" }), linha("IRRF_PROLABORE", fat, x.irrf, { detalhe: x.irrf === 0 ? "Pró-labore na faixa isenta pela redução legal de 2026." : undefined })); }
  const d = i.distribuicaoLucrosMensalCents ?? null;
  if (d === null) L.push(linha("IRRF_DIVIDENDOS", fat, null, { motivo: "Informe quanto de lucro será distribuído por mês ao sócio. Até R$ 50.000,00 por mês não há retenção; acima disso retém 10% sobre o total." }));
  else { const v = d > VALORES.dividendos.limiteMensal * 100 ? Math.round((d * VALORES.dividendos.aliquota) / 100) : 0; L.push(linha("IRRF_DIVIDENDOS", fat, v, { detalhe: v === 0 ? `Distribuição de ${brl(d)} não passa de R$ 50.000,00 no mês: sem retenção.` : `10% sobre o total de ${brl(d)} (passou de R$ 50.000,00 no mês)` })); }
  return { linhas: L, memo };
}

export function calcularPainel(i: PainelInputT) {
  const fat = i.faturamentoMensalCents ?? 0;
  const rbtInformado = i.rbt12Cents ?? null; const rbt12 = rbtInformado ?? fat * 12; const rbtEstimado = rbtInformado === null;
  const folha = i.folhaMensalCents ?? null, pl = i.proLaboreMensalCents ?? null;
  // Fator R: folha dos últimos 12 meses (aqui: valor mensal informado x 12) dividida pela receita dos 12 meses.
  let razao: number | null = null; let anexoAuto: "III" | "V" | null = null; const avisosFator: string[] = [];
  if (rbt12 > 0 && (folha !== null || pl !== null)) {
    razao = r2((((folha ?? 0) + (pl ?? 0)) * 12 * 100) / rbt12); anexoAuto = razao >= VALORES.simples.fatorRPct ? "III" : "V";
  } else avisosFator.push(fat > 0 ? "Informe a folha e/ou o pró-labore para o sistema definir o Anexo (Fator R)." : SEM_FAT);
  const regimes = [simplesRegime("III", i, fat, rbt12, rbtEstimado), simplesRegime("V", i, fat, rbt12, rbtEstimado), presumidoRegime(i, fat, rbt12), realRegime(i, fat)];
  const emFoco = (i.anexo ?? anexoAuto) ? (`simples_${(i.anexo ?? anexoAuto)!.toLowerCase()}` as RegimeResultado["key"]) : "simples_v";
  const completos = regimes.filter((r) => r.completo && r.subtotalCents !== null);
  const menor = completos.length > 1 ? completos.reduce((a, b) => (b.subtotalCents! < a.subtotalCents! ? b : a)) : null;
  const socio = socioLinhas(i, fat);
  const socioSub = fat > 0 || (pl ?? 0) > 0 ? socio.linhas.filter((l) => l.soma).reduce((a, l) => a + (l.valorCents ?? 0), 0) : null;
  const socioCompleto = socio.linhas.every((l) => l.estado === "calculado");
  return {
    aviso: "SIMULAÇÃO. Não é apuração oficial e não altera guias, notas, cobranças nem cadastro.",
    conferencia: CONFERENCIA, consultadoEm: CONSULTADO_EM,
    entrada: { faturamentoMensalCents: fat, rbt12Cents: rbt12, rbt12Estimado: rbtEstimado },
    fatorR: { razaoPct: razao, limitePct: VALORES.simples.fatorRPct, anexo: anexoAuto, avisos: avisosFator, explicacao: "Fator R = folha de pagamento dos últimos 12 meses (salários, pró-labore, encargos) dividida pela receita dos últimos 12 meses. Medicina no Simples: 28% ou mais = Anexo III; abaixo disso = Anexo V (LC 123/2006, art. 18, §§ 5º-J a 5º-M). Aqui a folha de 12 meses é estimada como o valor mensal informado x 12." },
    emFoco, regimes,
    comparacao: menor ? { menorCarga: menor.nome, menorCargaKey: menor.key } : null,
    socio: { linhas: socio.linhas, subtotalCents: socioSub, subtotalPct: socioSub !== null && fat > 0 ? r2((socioSub / fat) * 100) : null, completo: socioCompleto, memoria: socio.memo },
    nota: "O total de impostos soma só as linhas calculadas. Linhas vazias mostram o que falta informar; enquanto houver linha vazia o total é parcial.",
  };
}
export type PainelResultado = ReturnType<typeof calcularPainel>;
