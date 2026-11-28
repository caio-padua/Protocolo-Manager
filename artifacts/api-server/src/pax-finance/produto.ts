import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { z } from "zod";
import { registrarAuditoria } from "./auditoria";
import type { FinContext } from "./tenant";

/** Identidade de produto do Pax Finance (cadastro por empresa/tenant). Sem preco: fora do escopo. */
export const PRODUTO = { id: "pax_finance", nome: "Pax Finance", fronteira: "src/pax-finance (unico acoplamento com o PAXMED: tenant.ts)" } as const;
export const FLAGS_PADRAO = { metas_credito: true, impostos_cnpjs: true, fechamento_mes: true, cenario_demo: true, ia_maia: false, ia_estrategia: false, ia_auditoria: false } as const;
type Flags = Record<keyof typeof FLAGS_PADRAO, boolean>;
export const FlagsInput = z.object({ flags: z.record(z.string(), z.boolean()) });

export async function lerConfig(ctx: FinContext) {
  const r = (await db.execute(sql`SELECT flags, updated_at FROM fin_tenant_config WHERE company_id=${ctx.companyId}`)).rows[0] as { flags: Partial<Flags>; updated_at: string } | undefined;
  return { produto: PRODUTO, flags: { ...FLAGS_PADRAO, ...(r?.flags ?? {}) } as Flags, configurado: !!r };
}
export async function salvarFlags(ctx: FinContext, entrada: Record<string, boolean>) {
  const validas = Object.fromEntries(Object.entries(entrada).filter(([k]) => k in FLAGS_PADRAO));
  const atual = (await lerConfig(ctx)).flags;
  const novo = { ...atual, ...validas };
  // Agentes de IA nao existem ainda: nunca podem ser ligados por configuracao.
  for (const k of ["ia_maia", "ia_estrategia", "ia_auditoria"] as const) novo[k] = false;
  await db.execute(sql`INSERT INTO fin_tenant_config (company_id, flags, updated_by) VALUES (${ctx.companyId}, ${JSON.stringify(novo)}::jsonb, ${ctx.actorId})
    ON CONFLICT (company_id) DO UPDATE SET flags=EXCLUDED.flags, updated_by=EXCLUDED.updated_by, updated_at=now()`);
  await registrarAuditoria(db, ctx, "config.flags", "fin_tenant_config", null, { flags: validas });
  return lerConfig(ctx);
}

/** Estado HONESTO das tres inteligencias: nenhum agente, provedor, consentimento ou fila de execucao existe. Nada executa. */
export function estadoAgentes() {
  const base = { ligado: false, podeLigar: false, provedor: null as string | null, modelo: null as string | null, ultimaExecucao: null as string | null, fontes: [] as string[], pendencias: [] as string[], logs: [] as string[] };
  const comum = ["Provedor e modelo não configurados", "Consentimento e política de privacidade do tenant não registrados", "Fila de execução não implementada"];
  return [
    { id: "maia", nome: "Maia — extração documental", ...base, estado: "nao_configurado", motivo: "Upload de documentos e extração não existem. Desligada: nenhuma chamada é feita.", pendencias: ["Upload privado de documentos", ...comum] },
    { id: "estrategia", nome: "Inteligência 2 — análise tributária e estratégia de crédito", ...base, estado: "nao_configurado", motivo: "Sem provedor configurado. Pode ser testada no futuro só com dados fictícios, sem documentos pessoais.", pendencias: comum },
    { id: "auditoria", nome: "Inteligência 3 — auditoria independente", ...base, estado: "nao_auditado", motivo: "Sem execução: todo cálculo desta tela está NÃO AUDITADO por inteligência independente.", pendencias: comum },
  ];
}
