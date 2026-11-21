import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { z } from "zod";
import { brtISODate } from "../lib/brt";
import { FinError } from "./regras";
import type { FinContext } from "./tenant";

type Row = Record<string, unknown>;
const FINALIDADES = ["capital_giro", "investimento", "equipamentos"] as const;
type Finalidade = (typeof FINALIDADES)[number];

/** Catalogo DESCRITIVO. Nao contem limite, taxa, prazo nem multiplicador: isso so existe em fin_credit_line verificada. */
export const CATALOGO: { key: string; nome: string; perfil: string; finalidades: Finalidade[]; operadora: string }[] = [
  { key: "pronampe", nome: "Pronampe", perfil: "Micro e pequenas empresas (porte, data de contratação e instituição mudam a regra)", finalidades: ["capital_giro", "investimento"], operadora: "Instituições financeiras participantes (a validar)" },
  { key: "procred360", nome: "ProCred 360", perfil: "Pequenos negócios (a validar)", finalidades: ["capital_giro", "investimento"], operadora: "Instituição operadora (a validar)" },
  { key: "bndes", nome: "BNDES Crédito Pequenas Empresas", perfil: "Pequenas empresas (a validar)", finalidades: ["investimento", "capital_giro"], operadora: "Agentes financeiros credenciados (a validar)" },
  { key: "cartao_bndes", nome: "Cartão BNDES", perfil: "Compra de bens e serviços em fornecedores credenciados (a validar)", finalidades: ["investimento", "equipamentos"], operadora: "Bancos emissores (a validar)" },
  { key: "finame", nome: "BNDES Finame (equipamentos)", perfil: "Máquinas e equipamentos credenciados (a validar)", finalidades: ["equipamentos"], operadora: "Agentes financeiros credenciados (a validar)" },
  { key: "desenvolve_sp", nome: "Desenvolve SP", perfil: "Empresas paulistas (a validar)", finalidades: ["capital_giro", "investimento"], operadora: "Desenvolve SP (a validar)" },
  { key: "fgi_peac", nome: "FGI / PEAC", perfil: "Garantia de crédito, não é empréstimo direto (a validar)", finalidades: ["capital_giro", "investimento", "equipamentos"], operadora: "Instituição financeira que contrata (a validar)" },
  { key: "cooperativas", nome: "Cooperativas de crédito (Sicoob / Unicred)", perfil: "Associados da cooperativa (a validar)", finalidades: ["capital_giro", "investimento"], operadora: "Cooperativa (a validar)" },
];

export const SimCreditoInput = z.object({
  lineKey: z.string().max(40).optional(),
  valorDesejadoCents: z.number().int().positive(),
  finalidade: z.enum(FINALIDADES).default("capital_giro"),
  prazoMeses: z.number().int().min(1).max(120).default(36),
  cenarioMensalCents: z.number().int().nonnegative().optional(),
  tetoIlustrativoPct: z.number().min(1).max(1000).default(30),
});
type In = z.infer<typeof SimCreditoInput>;

const meses = (de: string, ate: string) => (Number(ate.slice(0, 4)) - Number(de.slice(0, 4))) * 12 + Number(ate.slice(5, 7)) - Number(de.slice(5, 7)) - (Number(ate.slice(8, 10)) < Number(de.slice(8, 10)) ? 1 : 0);
const proximoMes = (ym: string, n: number) => { const t = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pctDe = (v: unknown): number | null => { if (typeof v === "number") return v > 0 ? v : null; if (typeof v !== "string") return null; const m = v.match(/(\d+(?:[.,]\d+)?)/); const n = m ? Number(m[1].replace(",", ".")) : NaN; return n > 0 ? n : null; };

async function dadosEmpresa(ctx: FinContext) {
  const ent = (await db.execute(sql`SELECT data_constituicao, capital_social_cents, capital_integralizado FROM fin_entity WHERE company_id=${ctx.companyId} ORDER BY id LIMIT 1`)).rows[0] as Row | undefined;
  const pag = (await db.execute(sql`SELECT amount, COALESCE(paid_at::text, created_at::text) AS d FROM payments WHERE empresa_id=${ctx.companyId} AND status='paid'`)).rows as Row[];
  return { ent, pag };
}

async function simularLinha(ctx: FinContext, i: In, key: string, emp: Awaited<ReturnType<typeof dadosEmpresa>>) {
  const cat = CATALOGO.find((c) => c.key === key);
  if (!cat) throw new FinError(404, "Linha de credito desconhecida");
  const linha = (await db.execute(sql`SELECT * FROM fin_credit_line WHERE company_id=${ctx.companyId} AND line_key=${key} ORDER BY version DESC LIMIT 1`)).rows[0] as Row | undefined;
  const cond = (linha?.conditions ?? {}) as Record<string, unknown>;
  const verificada = linha?.status === "verificada";
  const pctRegra = verificada ? pctDe(cond.percentualTeto) : null;
  const confirmada = pctRegra !== null;
  const pct = pctRegra ?? i.tetoIlustrativoPct;
  const hoje = brtISODate(), atual = hoje.slice(0, 7), inicio12 = proximoMes(atual, -12);
  const janela = emp.pag.filter((p) => { const m = String(p.d).slice(0, 7); return m >= inicio12 && m < atual; });
  const comprovado = emp.pag.length ? Math.round(janela.reduce((a, p) => a + Number(p.amount ?? 0), 0) * 100) : null;
  const receitaAnual = Math.ceil((i.valorDesejadoCents * 100) / pct);
  const metaMensal = Math.ceil(receitaAnual / 12);
  const falta = comprovado === null ? receitaAnual : Math.max(0, receitaAnual - comprovado);
  const cenario = i.cenarioMensalCents ?? metaMensal;
  const mesesParaMeta = cenario > 0 ? Math.ceil(falta / cenario) : null;
  const n = Math.min(mesesParaMeta ?? 12, 36);
  let acc = 0;
  const plano = Array.from({ length: Math.max(n, 1) }, (_, k) => { acc += cenario; return { mes: proximoMes(atual, k + 1), metaMesCents: cenario, acumuladoCents: acc, faltaCents: Math.max(0, falta - acc) }; });
  const marcos = mesesParaMeta ? [25, 50, 75, 100].map((p) => { const alvo = Math.ceil((falta * p) / 100); const k = cenario > 0 ? Math.ceil(alvo / cenario) : null; return { percentual: p, acumuladoCents: alvo, mes: k ? proximoMes(atual, k) : null }; }) : [];
  const idadeMeses = emp.ent?.data_constituicao ? meses(String(emp.ent.data_constituicao).slice(0, 10), hoje) : null;
  const exigidoCnpj = verificada && typeof cond.tempoCnpjMeses === "number" ? cond.tempoCnpjMeses : null;
  const sit = (ok: boolean | null) => (ok === null ? "a_validar" : ok ? "atende" : "nao_atende");
  const dado = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const requisitos = [
    { nome: "Tempo de CNPJ", exigido: exigidoCnpj === null ? "Aguardando validação atual" : `${exigidoCnpj} meses`, situacao: sit(exigidoCnpj === null || idadeMeses === null ? null : idadeMeses >= exigidoCnpj), detalhe: idadeMeses === null ? "Data de constituição não informada" : `CNPJ com ${idadeMeses} meses (dado documental, rascunho)` },
    { nome: "Receita / faturamento", exigido: confirmada ? `${pct}% da receita anual` : "Aguardando validação atual", situacao: "a_validar", detalhe: comprovado === null ? "Não importado: nenhum pagamento da empresa foi encontrado" : `Recebido comprovado nos últimos 12 meses fechados: ${brl(comprovado)}` },
    { nome: "Capital social", exigido: "Aguardando validação atual", situacao: "a_validar", detalhe: emp.ent?.capital_social_cents == null ? "Não informado" : `${brl(Number(emp.ent.capital_social_cents))} declarado em documento. Integralização não comprovada: não usado como garantia nem como prova de capacidade` },
    { nome: "Capacidade de pagamento", exigido: "Definida pelo banco", situacao: "nao_avaliada", detalhe: "Depende de análise de crédito; esta tela não calcula nem substitui." },
    { nome: "Garantias", exigido: dado(cond.garantias) ?? "Aguardando validação atual", situacao: "a_validar", detalhe: "Definidas pelo programa e pela instituição." },
    { nome: "Documentos", exigido: dado(cond.documentos) ?? "Aguardando validação atual", situacao: "a_validar", detalhe: "Lista oficial ainda não registrada com fonte." },
    { nome: "Análise bancária e aprovação final", exigido: "Decisão da instituição", situacao: "pendente", detalhe: "Faturamento não garante aprovação." },
  ];
  const aderente = cat.finalidades.includes(i.finalidade);
  return {
    lineKey: key, nome: cat.nome, perfil: cat.perfil, operadora: cat.operadora, finalidadesDoPrograma: cat.finalidades, aderenteAFinalidade: aderente,
    modo: confirmada ? "regra_confirmada" : "estimativa_ilustrativa",
    avisoRegra: confirmada ? null : "REGRA DO PROGRAMA A VALIDAR",
    statusFonte: verificada ? "confirmado" : "aguardando_validacao_atual",
    fonte: { oficial: (linha?.fonte_oficial as string | null) ?? null, url: (linha?.fonte_url as string | null) ?? null, verificadaEm: linha?.verificada_em ? String(linha.verificada_em).slice(0, 10) : null, versao: linha ? Number(linha.version) : null },
    limiteTeoricoPrograma: verificada && cond.faturamentoExigidoCents != null ? Number(cond.faturamentoExigidoCents) : null,
    limiteCalculadoPreliminarCents: comprovado === null ? null : Math.floor((comprovado * pct) / 100),
    valorDesejadoCents: i.valorDesejadoCents, percentualUsado: pct, percentualOrigem: confirmada ? "regra verificada do programa" : "premissa ilustrativa editável (não é regra do programa)",
    receitaAnualNecessariaCents: receitaAnual, metaMensalCents: metaMensal, receitaMediaNecessariaCents: metaMensal,
    comprovadoUltimos12mCents: comprovado, comprovadoRotulo: comprovado === null ? "Não importado" : "Recebido comprovado (pagamentos da empresa)",
    faltaCents: falta, cenarioMensalCents: cenario, mesesParaMeta, plano, marcos, requisitos,
    memoria: [
      `Valor desejado: ${brl(i.valorDesejadoCents)}`, `Percentual do faturamento anual usado: ${pct}% (${confirmada ? "regra verificada" : "premissa ilustrativa"})`,
      `Receita anual necessária = valor ÷ percentual = ${brl(receitaAnual)}`, `Meta mensal = receita anual ÷ 12 = ${brl(metaMensal)}`,
      comprovado === null ? "Comprovado: não importado (sem pagamentos vinculados à empresa)" : `Comprovado nos 12 meses fechados: ${brl(comprovado)}`,
      `Falta = ${brl(falta)}; cenário mensal ${brl(cenario)} => ${mesesParaMeta === null ? "indefinido" : `${mesesParaMeta} meses`} (estimativa)`,
    ],
  };
}

export async function simularCredito(ctx: FinContext, i: In) {
  if (!i.lineKey) throw new FinError(400, "Escolha a linha de credito");
  return { aviso: "Faturamento não garante aprovação. Isto é simulação de metas, não oferta nem análise de crédito.", resultado: await simularLinha(ctx, i, i.lineKey, await dadosEmpresa(ctx)) };
}

/** Compara todas as linhas e recomenda so quando ha base: sem regra confirmada nao ha recomendacao firme. */
export async function compararCredito(ctx: FinContext, i: In) {
  const emp = await dadosEmpresa(ctx);
  const linhas = [];
  for (const c of CATALOGO) linhas.push(await simularLinha(ctx, i, c.key, emp));
  const confirmadas = linhas.filter((l) => l.modo === "regra_confirmada" && l.aderenteAFinalidade && !l.requisitos.some((r) => r.situacao === "nao_atende"));
  const ordem = (confirmadas.length ? confirmadas : linhas.filter((l) => l.aderenteAFinalidade)).slice().sort((a, b) => a.metaMensalCents - b.metaMensalCents);
  return {
    aviso: "Faturamento não garante aprovação. Isto é simulação de metas, não oferta nem análise de crédito.",
    recomendacaoFirme: confirmadas.length > 0,
    justificativa: confirmadas.length
      ? "Linhas com regra verificada, aderentes à finalidade e sem requisito reprovado, da menor para a maior meta mensal."
      : "Nenhuma linha tem regra verificada com fonte oficial. A lista mostra apenas linhas cuja finalidade combina com o objetivo, em estimativa ilustrativa (REGRA DO PROGRAMA A VALIDAR). Não é recomendação.",
    ordemSugerida: ordem.map((l) => l.lineKey), linhas,
  };
}
