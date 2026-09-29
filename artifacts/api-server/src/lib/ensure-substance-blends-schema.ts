import { pool } from "@workspace/db";

/**
 * Estrutura aditiva dos blends.
 *
 * A tabela substances continua sendo a unidade comercial escolhida no
 * protocolo. Os componentes são apenas o detalhamento interno da ampola.
 * Esta migração é idempotente e não remove nem reclassifica registros fora dos
 * casos explicitamente confirmados.
 */
export async function ensureSubstanceBlendsSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE substances
      ADD COLUMN IF NOT EXISTS is_blend BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS presentation_quantity REAL,
      ADD COLUMN IF NOT EXISTS presentation_unit TEXT,
      ADD COLUMN IF NOT EXISTS ampoule_volume_ml REAL;

    CREATE TABLE IF NOT EXISTS substance_blend_components (
      id SERIAL PRIMARY KEY,
      substance_id INTEGER NOT NULL REFERENCES substances(id) ON DELETE CASCADE,
      component_substance_id INTEGER REFERENCES substances(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      component_name TEXT NOT NULL,
      dose_value REAL,
      dose_unit TEXT,
      quantity REAL,
      quantity_unit TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_substance_blend_components_substance
      ON substance_blend_components (substance_id, sort_order, id);
  `);

  // Os registros antigos chamados BLEND já trazem composição textual. Apenas
  // marcamos o tipo; não inventamos dose, volume ou quantidade.
  await pool.query(`
    UPDATE substances
       SET is_blend = TRUE
     WHERE upper(trim(name)) = 'BLEND'
       AND composicao IS NOT NULL
       AND trim(composicao) <> ''
       AND is_blend = FALSE
  `);

  // ADEK foi conferida pelo CEO: uma ampola de 2 mL, com quatro componentes.
  // A guarda evita duplicação caso o servidor reinicie.
  const adek = await pool.query<{ id: number }>(`
    UPDATE substances
       SET is_blend = TRUE,
           presentation_quantity = 1,
           presentation_unit = 'ampola',
           ampoule_volume_ml = 2,
           volume_ampola = '2 mL'
     WHERE upper(trim(name)) = 'ADEK (VITAMINAS A, D, E, K)'
     RETURNING id
  `);

  if (adek.rows.length > 0) {
    const substanceId = adek.rows[0].id;
    const existing = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM substance_blend_components WHERE substance_id = $1`,
      [substanceId],
    );
    if (Number(existing.rows[0]?.total ?? 0) === 0) {
      await pool.query(
        `INSERT INTO substance_blend_components
          (substance_id, sort_order, component_name, dose_value, dose_unit)
         VALUES
          ($1, 1, 'Vitamina A (palmitato de retinol)', 25000, 'UI'),
          ($1, 2, 'Vitamina D3 (colecalciferol)', 100000, 'UI'),
          ($1, 3, 'Vitamina E (alfatocoferol)', 200, 'UI'),
          ($1, 4, 'Vitamina K2-MK7', 1300, 'mcg')`,
        [substanceId],
      );
    }
  }
}