import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// Snapshots deliberately have no catalogue FK: a removed exam must remain visible.
export async function ensureExamSetsTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS personal_exam_sets (
      id SERIAL PRIMARY KEY,
      professional_id INTEGER NOT NULL REFERENCES professionals(id),
      location_id INTEGER NOT NULL REFERENCES locations(id),
      empresa_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      items JSONB NOT NULL,
      archived BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS personal_exam_sets_owner
    ON personal_exam_sets (professional_id, location_id, empresa_id)`);
}

export interface ExamSetScope {
  professionalId: number;
  locationId: number;
  empresaId: number;
}
export function examSetOwner(scope: ExamSetScope) {
  return sql`professional_id = ${scope.professionalId}
    AND location_id = ${scope.locationId} AND empresa_id = ${scope.empresaId}`;
}
