import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { z } from "zod";
import { registrarAuditoria } from "./auditoria";
import { calcularLab, premissasPadrao, OverridesInput, PremissasInput, type Overrides, type Premissas } from "./laboratorio-calc";
import type { FinContext } from "./tenant";

type Row = Record<string, unknown>;
const SCENARIO_ID = "lab-24m";
export const LabSalvarInput = z.object({ premissas: PremissasInput, overrides: OverridesInput.default({}) });

async function carregar(ctx: FinContext) {
  const r = (await db.execute(sql`SELECT premissas, overrides, updated_at FROM fin_sim_scenario WHERE company_id=${ctx.companyId} AND scenario_id=${SCENARIO_ID} AND is_simulation=true`)).rows as Row[];
  if (!r.length) return { salvo: false, premissas: premissasPadrao(), overrides: {} as Overrides, atualizadoEm: null as string | null };
  const p = PremissasInput.safeParse(r[0].premissas), o = OverridesInput.safeParse(r[0].overrides);
  return { salvo: true, premissas: p.success ? p.data : premissasPadrao(), overrides: o.success ? o.data : {}, atualizadoEm: String(r[0].updated_at) };
}

/** Le a simulacao da empresa da sessao. Sem registro salvo, devolve as premissas padrao (nada e gravado so por ler). */
export async function lerLab(ctx: FinContext, inicio?: string) {
  const c = await carregar(ctx);
  const premissas: Premissas = inicio ? PremissasInput.parse({ ...c.premissas, inicio }) : c.premissas;
  return { scenarioId: SCENARIO_ID, salvo: c.salvo, atualizadoEm: c.atualizadoEm, ...calcularLab(premissas, c.overrides) };
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
