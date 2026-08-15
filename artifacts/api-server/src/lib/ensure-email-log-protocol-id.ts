/**
 * Migração de boot idempotente: adiciona a coluna `protocol_id` à tabela
 * `email_log` para permitir rastreio de reenvios por protocolo (RAS FAP).
 *
 * Segue o mesmo padrão de ensurePhotoHistoryTable / ensureProtocolEmissoesTable
 * já usado neste projeto.
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

let _ready: Promise<void> | null = null;

export async function ensureEmailLogProtocolId(): Promise<void> {
  if (!_ready) {
    _ready = (async () => {
      await db.execute(sql`
        ALTER TABLE email_log
        ADD COLUMN IF NOT EXISTS protocol_id INTEGER
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_email_log_protocol_id
        ON email_log (protocol_id)
      `);
    })();
  }
  return _ready;
}
