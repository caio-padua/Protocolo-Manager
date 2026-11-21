import { sql } from "drizzle-orm";
import type { FinContext } from "./tenant";

type Executor = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };

/** Trilha imutável do domínio (gatilho do banco bloqueia UPDATE e DELETE). */
export async function registrarAuditoria(tx: Executor, ctx: FinContext, action: string, entity: string, entityId: number | null, detail: Record<string, unknown> = {}) {
  await tx.execute(sql`INSERT INTO fin_audit_log (company_id, actor_id, action, entity, entity_id, detail)
    VALUES (${ctx.companyId}, ${ctx.actorId}, ${action}, ${entity}, ${entityId}, ${JSON.stringify(detail)}::jsonb)`);
}
