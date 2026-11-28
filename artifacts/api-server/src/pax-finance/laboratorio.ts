import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { z } from "zod";
import { registrarAuditoria } from "./auditoria";
import { calcularLab, premissasPadrao, somaMes, OverridesInput, PremissasInput, type Overrides, type Premissas } from "./laboratorio-calc";
import type { FinContext } from "./tenant";

type Row = Record<string, unknown>;
const SCENARIO_ID = "lab-24m";
export const LabSalvarInput = z.object({ premissas: PremissasInput, overrides: OverridesInput.default({}) });

/** Premissas derivadas dos dados da empresa (série mensal de demonstração), sem digitação: base = último mês + crescimento médio composto. */
export async function sugerirPremissas(ctx: FinContext): Promise<{ premissas: Premissas; origem: string }> {
  const rows = (await db.execute(sql`SELECT ano, mes, valor_cents FROM fin_scenario_month WHERE company_id=${ctx.companyId} AND scenario_type='DEMO' AND valor_cents>0 ORDER BY ano, mes`)).rows as Row[];
  const padrao = premissasPadrao();
  if (rows.length < 2) return { premissas: padrao, origem: "valores padrão de demonstração (a empresa ainda não tem série mensal)" };
  const v = rows.map((r) => Number(r.valor_cents)); const u = rows[rows.length - 1];
  const g = (Math.pow(v[v.length - 1] / v[0], 1 / (v.length - 1)) - 1) * 100;
  const cresc = Math.max(-50, Math.min(100, Math.round(g * 100) / 100));
  const ult = `${Number(u.ano)}-${String(Number(u.mes)).padStart(2, "0")}`;
  const inicio = somaMes(ult, 1); const base = Math.round(v[v.length - 1] * (1 + cresc / 100));
  const teto = Math.max(padrao.tetoFaturamentoCents ?? 0, base * 4);
  return { premissas: { ...padrao, inicio, faturamentoBaseCents: base, crescimentoMensalPct: cresc, tetoFaturamentoCents: teto, despesasFixasCents: Math.round(base * 0.25), folhaCltCents: Math.round(base * 0.15) }, origem: `série mensal da empresa (${rows.length} meses até ${ult}): base e crescimento calculados; folha e despesas em 15% e 25% da base` };
}

async function carregar(ctx: FinContext) {
  const r = (await db.execute(sql`SELECT premissas, overrides, updated_at FROM fin_sim_scenario WHERE company_id=${ctx.companyId} AND scenario_id=${SCENARIO_ID} AND is_simulation=true`)).rows as Row[];
  if (!r.length) { const s = await sugerirPremissas(ctx); return { salvo: false, premissas: s.premissas, origem: s.origem, overrides: {} as Overrides, atualizadoEm: null as string | null }; }
  const p = PremissasInput.safeParse(r[0].premissas), o = OverridesInput.safeParse(r[0].overrides);
  return { salvo: true, origem: "premissas salvas", premissas: p.success ? p.data : premissasPadrao(), overrides: o.success ? o.data : {}, atualizadoEm: String(r[0].updated_at) };
}

/** Le a simulacao da empresa da sessao. Sem registro salvo, devolve as premissas padrao (nada e gravado so por ler). */
export async function lerLab(ctx: FinContext, inicio?: string) {
  const c = await carregar(ctx);
  const premissas: Premissas = inicio ? PremissasInput.parse({ ...c.premissas, inicio }) : c.premissas;
  return { scenarioId: SCENARIO_ID, salvo: c.salvo, origemPremissas: c.origem, atualizadoEm: c.atualizadoEm, ...calcularLab(premissas, c.overrides) };
}

export async function salvarLab(ctx: FinContext, i: z.infer<typeof LabSalvarInput>) {
  await db.execute(sql`INSERT INTO fin_sim_scenario (company_id, scenario_id, is_simulation, premissas, overrides, updated_by)
    VALUES (${ctx.companyId}, ${SCENARIO_ID}, true, ${JSON.stringify(i.premissas)}::jsonb, ${JSON.stringify(i.overrides)}::jsonb, ${ctx.actorId})
    ON CONFLICT (company_id, scenario_id) DO UPDATE SET premissas=EXCLUDED.premissas, overrides=EXCLUDED.overrides, updated_by=EXCLUDED.updated_by, updated_at=now()`);
  await registrarAuditoria(db, ctx, "lab.salvar", "fin_sim_scenario", null, { inicio: i.premissas.inicio, ajustes: Object.keys(i.overrides).length });
  return lerLab(ctx);
}

/** Limpa SO a simulacao da empresa da sessao. Nao toca em notas, Asaas, payments nem lancamentos. */
export async function limparLab(ctx: FinContext) {
  const r = await db.execute(sql`DELETE FROM fin_sim_scenario WHERE company_id=${ctx.companyId} AND scenario_id=${SCENARIO_ID} RETURNING id`);
  await registrarAuditoria(db, ctx, "lab.limpar", "fin_sim_scenario", null, { apagados: r.rows.length });
  return { apagados: r.rows.length };
}
