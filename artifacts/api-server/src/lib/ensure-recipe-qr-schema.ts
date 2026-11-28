import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

let ready = false;

/**
 * Additive compatibility migration for public, expiring prescription QR links.
 * It preserves all existing recipe rows and never alters their PDFs.
 */
export async function ensureRecipeQrSchema(): Promise<void> {
  if (ready) return;

  await db.execute(sql`
    ALTER TABLE recipes
      ADD COLUMN IF NOT EXISTS qr_token_hash TEXT,
      ADD COLUMN IF NOT EXISTS qr_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS qr_pdf_sha256 TEXT
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS recipes_qr_token_hash_unique
      ON recipes (qr_token_hash)
      WHERE qr_token_hash IS NOT NULL
  `);

  ready = true;
}
