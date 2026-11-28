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

const CATEGORY_ALIASES: Record<string, string> = {
  medico: "medicina", medica: "medicina",
  enfermeiro: "enfermagem", enfermeira: "enfermagem",
  farmaceutico: "farmacia", farmaceutica: "farmacia",
  biomedico: "biomedicina", biomedica: "biomedicina",
};
export const HEALTH_CATEGORY_SLUGS = [
  "medicina", "medico", "medica", "enfermagem", "enfermeiro", "enfermeira",
  "farmacia", "farmaceutico", "farmaceutica", "biomedicina", "biomedico", "biomedica",
];

export function professionalCategoryIdentity(name: string): string {
  const normalized = normalizedCatalogName(name);
  return CATEGORY_ALIASES[normalized] ?? normalized;
}

// A categoria profissional nunca implica uma permissão ou um vínculo de agenda.
export async function includeRequiredWorkAreas(
  tx: Transaction, empresaId: number, professionalId: number, categoryId: number | null,
  ids: number[] | undefined,
): Promise<number[] | undefined> {
  if (!categoryId) return ids;
  const category = await tx.execute(sql`SELECT slug FROM professional_areas WHERE id=${categoryId} FOR SHARE`);
  if (!HEALTH_CATEGORY_SLUGS.includes(String(category.rows[0]?.slug ?? ""))) return ids;
  const health = await tx.execute(sql`SELECT id FROM professional_work_areas WHERE slug='saude' AND active=TRUE FOR SHARE`);
  if (!health.rows.length) throw new WorkAreaError(503, "A área Saúde não está disponível no cadastro.");
  const healthId = Number(health.rows[0].id);
  const previousHealth = await tx.execute(sql`
    SELECT active FROM professional_work_area_links
    WHERE empresa_id=${empresaId} AND professional_id=${professionalId} AND work_area_id=${healthId}
    FOR UPDATE
  `);
  if (previousHealth.rows[0]?.active === false) {
    throw new WorkAreaError(409, "O vínculo com Saúde foi desativado anteriormente e precisa ser conferido.");
  }
  if (ids !== undefined) return ids.includes(healthId) ? ids : [...ids, healthId];
  const existing = await tx.execute(sql`
    SELECT work_area_id FROM professional_work_area_links
    WHERE empresa_id=${empresaId} AND professional_id=${professionalId} AND active=TRUE FOR UPDATE
  `);
  const current = existing.rows.map((row) => Number(row.work_area_id));
  return current.includes(healthId) ? current : [...current, healthId];
}

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
