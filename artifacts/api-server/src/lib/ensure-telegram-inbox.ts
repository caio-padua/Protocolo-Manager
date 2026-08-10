/**
 * Boot migration: cria a tabela telegram_inbox_messages se ainda não existir.
 * Segue o mesmo padrão de ensurePhotoHistoryTable: roda ANTES do app.listen.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function ensureTelegramInboxTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS telegram_inbox_messages (
      id          SERIAL PRIMARY KEY,
      empresa_id  INTEGER NOT NULL DEFAULT 0,
      cliente_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      chat_id     TEXT    NOT NULL,
      texto       TEXT    NOT NULL,
      recebida_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      lida_em     TIMESTAMPTZ
    )
  `);
  /* Adiciona empresa_id se a tabela já existia sem ela (idempotente) */
  await db.execute(sql`
    ALTER TABLE telegram_inbox_messages
      ADD COLUMN IF NOT EXISTS empresa_id INTEGER NOT NULL DEFAULT 0
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_telegram_inbox_cliente
      ON telegram_inbox_messages (cliente_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_telegram_inbox_recebida
      ON telegram_inbox_messages (recebida_em)
  `);
  /* Adiciona coluna de direção (entrada=paciente→bot / saida=CEO→paciente) */
  await db.execute(sql`
    ALTER TABLE telegram_inbox_messages
      ADD COLUMN IF NOT EXISTS direcao TEXT NOT NULL DEFAULT 'entrada'
  `);
  logger.info("telegram_inbox_messages: tabela pronta");
}
