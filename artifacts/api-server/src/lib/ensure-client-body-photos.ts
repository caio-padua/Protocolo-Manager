import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/** Boot: cria client_body_photos se ainda nao existir (idempotente; mesma definicao da migracao SQL). */
export async function ensureClientBodyPhotosTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS client_body_photos (
      id serial PRIMARY KEY,
      client_id integer NOT NULL,
      empresa_id integer NOT NULL,
      taken_on text NOT NULL,
      angle text NOT NULL,
      storage_path text NOT NULL,
      bytes integer NOT NULL,
      width integer NOT NULL,
      height integer NOT NULL,
      source text NOT NULL DEFAULT 'cliente',
      consent_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS client_body_photos_cliente_idx ON client_body_photos (client_id, taken_on)`);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS client_body_photos_slot_ativo_uq
      ON client_body_photos (client_id, taken_on, angle) WHERE deleted_at IS NULL
  `);
}
