import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

let schemaReady: Promise<void> | null = null;

/**
 * Migração somente aditiva. A separação por ambiente acompanha os usuários
 * independentes do Clerk em desenvolvimento e produção.
 */
export async function ensureProfessionalClerkIdentitySchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.execute(sql`
        ALTER TABLE professionals
          ADD COLUMN IF NOT EXISTS clerk_user_id_dev TEXT,
          ADD COLUMN IF NOT EXISTS clerk_user_id_prod TEXT
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS professionals_clerk_user_id_dev_uk
        ON professionals (clerk_user_id_dev)
        WHERE clerk_user_id_dev IS NOT NULL
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS professionals_clerk_user_id_prod_uk
        ON professionals (clerk_user_id_prod)
        WHERE clerk_user_id_prod IS NOT NULL
      `);
    })().catch((error: unknown) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}
