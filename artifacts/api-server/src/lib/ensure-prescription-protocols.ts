import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// Protocolos de prescricao salvos pelo medico (conjunto de formulas reutilizavel).
// Criacao idempotente e aditiva (sem DROP). "ativo=false" = removido da lista,
// a linha permanece (Regra de Ouro: nunca destruir).
export async function ensurePrescriptionProtocolsTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS prescription_protocols (
      id              SERIAL PRIMARY KEY,
      professional_id INTEGER NOT NULL,
      nome            TEXT    NOT NULL,
      formula_ids     JSONB   NOT NULL,
      ativo           BOOLEAN NOT NULL DEFAULT TRUE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS prescription_protocols_prof_nome_uq
      ON prescription_protocols (professional_id, lower(nome)) WHERE ativo
  `);
}
