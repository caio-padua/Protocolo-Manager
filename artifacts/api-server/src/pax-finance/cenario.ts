import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { z } from "zod";
import { registrarAuditoria } from "./auditoria";
import { FinError } from "./regras";
import type { FinContext } from "./tenant";

type Row = Record<string, unknown>;
export const ROTULO_DEMO = "DADOS FICTÍCIOS — SIMULAÇÃO — NÃO SÃO FATURAMENTO REAL";

/** Valores ilustrativos de 2026 pedidos pelo CEO (centavos). Jan-Out = simulacao; Nov-Dez = projecao. Totais NUNCA vem daqui: o backend soma as linhas. */
export const DEMO_2026: { mes: number; valorCents: number; natureza: "simulacao" | "projecao" }[] = [
  [18500, "simulacao"], [22300, "simulacao"], [26800, "simulacao"], [31400, "simulacao"], [35900, "simulacao"], [38700, "simulacao"],
  [42100, "simulacao"], [39600, "simulacao"], [45300, "simulacao"], [48200, "simulacao"], [52000, "projecao"], [58000, "projecao"],
].map(([v, n], i) => ({ mes: i + 1, valorCents: (v as number) * 100, natureza: n as "simulacao" | "projecao" }));

export const CenarioMesInput = z.object({
  ano: z.number().int().min(2000).max(2100), valorCents: z.number().int().nonnegative(), natureza: z.enum(["simulacao", "projecao"]),
});

export async function semearDemo(ctx: FinContext, ano = 2026) {
  if (ano !== 2026) throw new FinError(400, "Os valores demonstrativos prontos existem apenas para 2026");
  return db.transaction(async (tx) => {
    let n = 0;
    for (const d of DEMO_2026) {
      const r = await tx.execute(sql`INSERT INTO fin_scenario_month (company_id, scenario_type, ano, mes, natureza, valor_cents, label, updated_by)
        VALUES (${ctx.companyId}, 'DEMO', ${ano}, ${d.mes}, ${d.natureza}, ${d.valorCents}, ${ROTULO_DEMO}, ${ctx.actorId}) ON CONFLICT (company_id, scenario_type, ano, mes) DO NOTHING RETURNING id`);
      n += r.rows.length;
    }
    if (n) await registrarAuditoria(tx, ctx, "cenario.demo_semear", "fin_scenario_month", null, { ano, meses: n });
    return { criados: n };
  });
}

export async function salvarMesDemo(ctx: FinContext, mes: number, i: z.infer<typeof CenarioMesInput>) {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw new FinError(400, "Mes invalido");
  await db.execute(sql`INSERT INTO fin_scenario_month (company_id, scenario_type, ano, mes, natureza, valor_cents, label, updated_by)
    VALUES (${ctx.companyId}, 'DEMO', ${i.ano}, ${mes}, ${i.natureza}, ${i.valorCents}, ${ROTULO_DEMO}, ${ctx.actorId})
    ON CONFLICT (company_id, scenario_type, ano, mes) DO UPDATE SET natureza=EXCLUDED.natureza, valor_cents=EXCLUDED.valor_cents, updated_by=EXCLUDED.updated_by, updated_at=now()`);
  await registrarAuditoria(db, ctx, "cenario.demo_editar", "fin_scenario_month", null, { ano: i.ano, mes });
  return lerCenario(ctx, i.ano);
}
export async function apagarDemo(ctx: FinContext, ano: number, mes?: number) {
  const r = mes
    ? await db.execute(sql`DELETE FROM fin_scenario_month WHERE company_id=${ctx.companyId} AND scenario_type='DEMO' AND ano=${ano} AND mes=${mes} RETURNING id`)
    : await db.execute(sql`DELETE FROM fin_scenario_month WHERE company_id=${ctx.companyId} AND scenario_type='DEMO' AND ano=${ano} RETURNING id`);
  await registrarAuditoria(db, ctx, "cenario.demo_apagar", "fin_scenario_month", null, { ano, mes: mes ?? "todos", apagados: r.rows.length });
  return { apagados: r.rows.length };
}

/** Tres series separadas: Real comprovado (so payments da empresa), Simulacao DEMO e Projecao DEMO. Totais calculados aqui. */
export async function lerCenario(ctx: FinContext, ano: number) {
  const demo = (await db.execute(sql`SELECT mes, natureza, valor_cents, label FROM fin_scenario_month WHERE company_id=${ctx.companyId} AND scenario_type='DEMO' AND ano=${ano} ORDER BY mes`)).rows as Row[];
  const real = (await db.execute(sql`SELECT substr(COALESCE(paid_at::text, created_at::text),6,2)::int AS mes, COALESCE(SUM(amount),0) AS s, COUNT(*)::int AS n
    FROM payments WHERE empresa_id=${ctx.companyId} AND status='paid' AND substr(COALESCE(paid_at::text, created_at::text),1,4)=${String(ano)} GROUP BY 1`)).rows as Row[];
  const realMap = new Map(real.map((x) => [Number(x.mes), Math.round(Number(x.s) * 100)]));
  const demoMap = new Map(demo.map((x) => [Number(x.mes), x]));
  const meses = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1, d = demoMap.get(m);
    return {
      mes: m,
      realComprovadoCents: realMap.has(m) ? realMap.get(m)! : null,
      realRotulo: realMap.has(m) ? "Recebido (Asaas/pagamentos da empresa)" : "Sem dados importados",
      simulacaoCents: d && d.natureza === "simulacao" ? Number(d.valor_cents) : null,
      projecaoCents: d && d.natureza === "projecao" ? Number(d.valor_cents) : null,
    };
  });
  const soma = (f: (m: (typeof meses)[number]) => number | null) => meses.reduce((a, m) => a + (f(m) ?? 0), 0);
  const simulacao = soma((m) => m.simulacaoCents), projecao = soma((m) => m.projecaoCents);
  return {
    ano, scenarioType: "DEMO", rotulo: ROTULO_DEMO,
    aviso: "Estes valores são fictícios, vivem em tabela própria e nunca entram em notas, Asaas, caixa, livros ou comprovantes para banco, Receita ou contador.",
    meses,
    totais: {
      simulacaoCents: demo.length ? simulacao : null, projecaoCents: demo.length ? projecao : null,
      projecaoAnualIlustrativaCents: demo.length ? simulacao + projecao : null,
      realComprovadoCents: real.length ? soma((m) => m.realComprovadoCents) : null,
    },
    temDemo: demo.length > 0, temReal: real.length > 0,
  };
}
