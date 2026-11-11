import { sql, type SQL } from "drizzle-orm";
import { z } from "zod/v4";

export class WorkAreaError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const workAreaIdsSchema = z.array(z.number().int().positive()).max(100).refine(
  (ids) => new Set(ids).size === ids.length,
  "Uma área não pode ser repetida.",
);

export function normalizedCatalogName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

type Transaction = { execute: (query: SQL) => Promise<{ rows: Record<string, unknown>[] }> };

// Deve ser chamada na transação que grava o profissional, com a linha dele travada.
export async function saveWorkAreaLinks(
  tx: Transaction, empresaId: number, professionalId: number, actorId: number, ids: number[],
) {
  const checked = workAreaIdsSchema.safeParse(ids);
  if (!checked.success) throw new WorkAreaError(400, "Áreas de atuação inválidas ou repetidas.");
  const available = ids.length
    ? await tx.execute(sql`
        SELECT id FROM professional_work_areas
        WHERE active = TRUE AND id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) FOR SHARE
      `)
    : { rows: [] };
  if (available.rows.length !== ids.length) {
    throw new WorkAreaError(400, "Uma das áreas selecionadas não existe ou está inativa.");
  }
  const current = await tx.execute(sql`
    SELECT work_area_id FROM professional_work_area_links
    WHERE empresa_id = ${empresaId} AND professional_id = ${professionalId} AND active = TRUE
    FOR UPDATE
  `);
  const before = new Set(current.rows.map((r) => Number(r.work_area_id)));
  const after = new Set(ids);
  for (const id of new Set([...before, ...after])) {
    const wasActive = before.has(id);
    const isActive = after.has(id);
    if (wasActive === isActive) continue;
    await tx.execute(sql`
      INSERT INTO professional_work_area_links (empresa_id, professional_id, work_area_id, active)
      VALUES (${empresaId}, ${professionalId}, ${id}, ${isActive})
      ON CONFLICT (empresa_id, professional_id, work_area_id) DO UPDATE SET active = EXCLUDED.active
    `);
    await tx.execute(sql`
      INSERT INTO professional_work_area_history (empresa_id, professional_id, work_area_id, actor_id, active)
      VALUES (${empresaId}, ${professionalId}, ${id}, ${actorId}, ${isActive})
    `);
  }
}
