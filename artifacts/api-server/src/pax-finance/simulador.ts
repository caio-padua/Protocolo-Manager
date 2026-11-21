import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { z } from "zod";
import { brtISODate } from "../lib/brt";
import { paraApi } from "./regras";
import type { FinContext } from "./tenant";

/**
 * Simuladores tributarios. NENHUMA aliquota, limite ou presuncao esta escrita aqui:
 * tudo vem de regras (fin_tax_rule) ativas/vigentes, com fonte oficial. Sem regra = "pendente", nunca numero inventado.
 * Resultado e SIMULACAO: nunca alimenta apuracao oficial.
 */
type Regra = ReturnType<typeof paraApi>;
export interface Cenario {
  nome: string; status: "calculado" | "pendente"; impostoMensalCents: number | null; aliquotaEfetivaPct: number | null;
  memoria: string[]; pendencias: string[]; regrasUsadas: { ruleKey: string; version: number; fonteUrl: string | null }[];
}
const usada = (r: Regra) => ({ ruleKey: String(r.ruleKey), version: r.version, fonteUrl: r.fonteUrl ? String(r.fonteUrl) : null });
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;

export function simularSimples(regras: Regra[], anexo: string, rbt12: number, receitaMensal: number): Cenario {
  const nome = `Simples Nacional - Anexo ${anexo}`;
  const faixas = regras.filter((r) => r.regime === "simples_nacional" && r.anexo === anexo);
  if (rbt12 <= 0) return { nome, status: "pendente", impostoMensalCents: null, aliquotaEfetivaPct: null, memoria: [], pendencias: ["Informe a receita bruta dos ultimos 12 meses (RBT12)"], regrasUsadas: [] };
  if (!faixas.length) return { nome, status: "pendente", impostoMensalCents: null, aliquotaEfetivaPct: null, memoria: [], pendencias: [`Aguardando regra aprovada e ativa do Anexo ${anexo} (tabela de faixas)`], regrasUsadas: [] };
  const f = faixas.find((r) => (r.limiteMinCents ?? 0) <= rbt12 && (r.limiteMaxCents === null || rbt12 <= r.limiteMaxCents));
  if (!f || f.aliquotaPct === null) return { nome, status: "pendente", impostoMensalCents: null, aliquotaEfetivaPct: null, memoria: [], pendencias: [`Nenhuma faixa cadastrada cobre o RBT12 de ${brl(rbt12)}`], regrasUsadas: [] };
  const pd = f.parcelaDeduzirCents ?? 0;
  const efetiva = (rbt12 * (f.aliquotaPct / 100) - pd) / rbt12;
  const imposto = Math.round(receitaMensal * efetiva);
  return {
    nome, status: "calculado", impostoMensalCents: imposto, aliquotaEfetivaPct: Math.round(efetiva * 1e6) / 1e4,
    memoria: [`Faixa usada: ${f.ruleKey} (versao ${f.version})`, `Aliquota nominal ${pct(f.aliquotaPct)} e parcela a deduzir ${brl(pd)}`,
      `Aliquota efetiva = (RBT12 ${brl(rbt12)} x ${pct(f.aliquotaPct)} - ${brl(pd)}) / RBT12 = ${pct(efetiva * 100)}`,
      `Imposto estimado do mes = receita mensal ${brl(receitaMensal)} x aliquota efetiva = ${brl(imposto)}`],
    pendencias: [], regrasUsadas: [usada(f)],
  };
}

export function fatorR(regras: Regra[], folha12: number, rbt12: number) {
  const regra = regras.find((r) => r.tributo === "FATOR_R");
  const razao = rbt12 > 0 ? Math.round((folha12 / rbt12) * 1e6) / 1e4 : null;
  const pend: string[] = [];
  if (razao === null) pend.push("Informe o RBT12");
  if (!regra || regra.aliquotaPct === null) pend.push("Aguardando regra FATOR_R aprovada (limite e anexos)");
  const limite = regra?.aliquotaPct ?? null;
  const ac = regra ? String((regra.params as Record<string, unknown>).anexoAcima ?? "") : "";
  const ab = regra ? String((regra.params as Record<string, unknown>).anexoAbaixo ?? "") : "";
  if (regra && (!ac || !ab)) pend.push("Regra FATOR_R sem os anexos de destino em params (anexoAcima/anexoAbaixo)");
  const anexo = razao !== null && limite !== null && ac && ab ? (razao >= limite ? ac : ab) : null;
  return { razaoPct: razao, limitePct: limite, anexo, pendencias: pend, regraUsada: regra ? usada(regra) : null,
    aviso: "Use somente rubricas de folha elegiveis e comprovadas; pagamento a autonomo (RPA) nao entra automaticamente." };
}

export function simularPresumido(regras: Regra[], receitaMensal: number): Cenario {
  const nome = "Lucro Presumido";
  const tributos = regras.filter((r) => r.regime === "lucro_presumido" && r.tributo !== "PRESUNCAO");
  const presuncoes = regras.filter((r) => r.regime === "lucro_presumido" && r.tributo === "PRESUNCAO");
  const pend: string[] = [];
  if (!tributos.length) pend.push("Aguardando regras aprovadas dos tributos do Lucro Presumido (IRPJ, CSLL, PIS, COFINS, ISS)");
  const memoria: string[] = []; const usadas: Regra[] = []; let total = 0;
  for (const t of tributos) {
    if (t.aliquotaPct === null) { pend.push(`${t.tributo}: regra sem aliquota`); continue; }
    let base = receitaMensal;
    if (t.base === "presumida") {
      const p = presuncoes.find((x) => x.cnae === t.cnae || x.ruleKey === (t.params as Record<string, unknown>).presuncaoKey);
      if (!p || p.aliquotaPct === null) { pend.push(`${t.tributo}: falta a regra de presuncao vinculada`); continue; }
      base = Math.round(receitaMensal * (p.aliquotaPct / 100)); usadas.push(p);
      memoria.push(`${t.tributo}: base presumida = ${brl(receitaMensal)} x ${pct(p.aliquotaPct)} = ${brl(base)}`);
    }
    const v = Math.round(base * (t.aliquotaPct / 100)); total += v; usadas.push(t);
    memoria.push(`${t.tributo}: ${brl(base)} x ${pct(t.aliquotaPct)} = ${brl(v)}`);
  }
  if (pend.length) return { nome, status: "pendente", impostoMensalCents: null, aliquotaEfetivaPct: null, memoria, pendencias: pend, regrasUsadas: usadas.map(usada) };
  return { nome, status: "calculado", impostoMensalCents: total, aliquotaEfetivaPct: receitaMensal > 0 ? Math.round((total / receitaMensal) * 1e6) / 1e4 : null, memoria, pendencias: [], regrasUsadas: usadas.map(usada) };
}

export const SimInput = z.object({
  rbt12Cents: z.number().int().nonnegative(), receitaMensalCents: z.number().int().nonnegative(), folha12Cents: z.number().int().nonnegative().default(0),
  anexos: z.array(z.string().trim().min(1).max(5)).max(5).default(["III", "V"]),
});

/** Regras vigentes hoje (ativas) da empresa da sessao; ultima versao de cada chave. */
export async function regrasVigentesHoje(ctx: FinContext): Promise<Regra[]> {
  const dia = brtISODate();
  const r = await db.execute(sql`SELECT DISTINCT ON (rule_key) * FROM fin_tax_rule WHERE company_id=${ctx.companyId} AND status='ativa'
    AND vigencia_inicio <= ${dia}::date AND (vigencia_fim IS NULL OR vigencia_fim >= ${dia}::date) ORDER BY rule_key, version DESC`);
  return (r.rows as Record<string, unknown>[]).map(paraApi);
}

export async function simular(ctx: FinContext, i: z.infer<typeof SimInput>) {
  const regras = await regrasVigentesHoje(ctx);
  const fr = fatorR(regras, i.folha12Cents, i.rbt12Cents);
  const cenarios: Cenario[] = [...i.anexos.map((a) => simularSimples(regras, a, i.rbt12Cents, i.receitaMensalCents)), simularPresumido(regras, i.receitaMensalCents)];
  const ok = cenarios.filter((c) => c.status === "calculado" && c.impostoMensalCents !== null);
  const melhor = ok.length ? ok.reduce((a, b) => (b.impostoMensalCents! < a.impostoMensalCents! ? b : a)) : null;
  const pior = ok.length > 1 ? ok.reduce((a, b) => (b.impostoMensalCents! > a.impostoMensalCents! ? b : a)) : null;
  const sensibilidade = [-20, -10, 0, 10, 20].map((v) => {
    const rbt = Math.round(i.rbt12Cents * (1 + v / 100));
    const s = i.anexos.map((a) => ({ anexo: a, aliquotaEfetivaPct: simularSimples(regras, a, rbt, i.receitaMensalCents).aliquotaEfetivaPct }));
    return { variacaoPct: v, rbt12Cents: rbt, simples: s };
  });
  return {
    aviso: "SIMULACAO. Nao e apuracao oficial e nao altera guias, notas ou cobrancas.", fatorR: fr, cenarios,
    comparacao: melhor ? { menorCenario: melhor.nome, economiaEstimadaMensalCents: pior ? pior.impostoMensalCents! - melhor.impostoMensalCents! : null } : null,
    sensibilidade, premissas: [`RBT12 informado: ${brl(i.rbt12Cents)}`, `Receita mensal simulada: ${brl(i.receitaMensalCents)}`, `Folha 12 meses informada: ${brl(i.folha12Cents)}`, `Regras ativas consideradas: ${regras.length}`],
  };
}
