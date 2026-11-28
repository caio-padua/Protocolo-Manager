import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

let schemaReady: Promise<void> | null = null;

/**
 * Cria a tabela dos vínculos empresariais adicionais do profissional e faz a
 * carga inicial dos acessos que já existem. Somente aditivo e idempotente.
 * Mantido idêntico a scripts/migrations/20261109_profissional_empresas.sql.
 */
export const PROFESSIONAL_EMPRESAS_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS professional_empresas (
    id SERIAL PRIMARY KEY,
    professional_id INTEGER NOT NULL REFERENCES professionals(id),
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    ordem INTEGER NOT NULL CHECK (ordem BETWEEN 2 AND 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS professional_empresas_prof_empresa_uk
    ON professional_empresas (professional_id, empresa_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS professional_empresas_prof_ordem_uk
    ON professional_empresas (professional_id, ordem)`,
  `CREATE INDEX IF NOT EXISTS professional_empresas_empresa_idx
    ON professional_empresas (empresa_id)`,
];

export const PROFESSIONAL_EMPRESAS_BACKFILL = `
WITH desejados AS (
  SELECT DISTINCT lp.professional_id, COALESCE(l.empresa_id, 5) AS empresa_id
  FROM location_professionals lp
  JOIN locations l ON l.id = lp.location_id
  JOIN professionals p ON p.id = lp.professional_id
  JOIN empresas e ON e.id = COALESCE(l.empresa_id, 5)
  WHERE COALESCE(l.empresa_id, 5) <> COALESCE(p.empresa_id, 5)
),
novos AS (
  SELECT d.professional_id, d.empresa_id
  FROM desejados d
  WHERE NOT EXISTS (
    SELECT 1 FROM professional_empresas pe
    WHERE pe.professional_id = d.professional_id AND pe.empresa_id = d.empresa_id
  )
),
numerados AS (
  SELECT n.professional_id, n.empresa_id,
         COALESCE((SELECT MAX(pe.ordem) FROM professional_empresas pe WHERE pe.professional_id = n.professional_id), 1)
         + ROW_NUMBER() OVER (PARTITION BY n.professional_id ORDER BY n.empresa_id) AS ordem
  FROM novos n
)
INSERT INTO professional_empresas (professional_id, empresa_id, ordem)
SELECT professional_id, empresa_id, ordem FROM numerados WHERE ordem <= 5
ON CONFLICT DO NOTHING`;

export async function ensureProfessionalEmpresasSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const statement of PROFESSIONAL_EMPRESAS_DDL) {
        await db.execute(sql.raw(statement));
      }
      await db.execute(sql.raw(PROFESSIONAL_EMPRESAS_BACKFILL));
      // Observabilidade: agenda liberada em empresa fora da lista (ex.: mais de 4 adicionais).
      const orphan = await db.execute(sql`
        SELECT count(*)::int AS total
        FROM location_professionals lp
        JOIN locations l ON l.id = lp.location_id
        JOIN professionals p ON p.id = lp.professional_id
        WHERE COALESCE(l.empresa_id, 5) <> COALESCE(p.empresa_id, 5)
          AND NOT EXISTS (
            SELECT 1 FROM professional_empresas pe
            WHERE pe.professional_id = lp.professional_id
              AND pe.empresa_id = COALESCE(l.empresa_id, 5)
          )
      `);
      const total = Number((orphan.rows[0] as { total?: number } | undefined)?.total ?? 0);
      if (total > 0) {
        logger.warn({ total }, "agendas liberadas em empresa fora dos vínculos do profissional (nada foi alterado)");
      }
    })().catch((error: unknown) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}
