/**
 * Migração ADITIVA e REVERSÍVEL da deduplicação de mensagens do Telegram.
 *
 * Adiciona `update_id` (identificador que o Telegram atribui a cada entrega) e
 * um índice único PARCIAL em (chat_id, update_id). Linhas antigas ficam com
 * update_id NULL e NUNCA colidem (NULL não participa do índice parcial), logo
 * nenhum dado existente é alterado, apagado ou bloqueado.
 *
 * Reversão (só perde as chaves de deduplicação, nenhuma mensagem):
 *   DROP INDEX IF EXISTS ux_telegram_inbox_chat_update;
 *   ALTER TABLE telegram_inbox_messages DROP COLUMN IF EXISTS update_id;
 *
 * Este módulo não importa @workspace/db de propósito: o executor é injetado,
 * o que permite testar a migração real em um banco descartável.
 */
import { sql, type SQL } from "drizzle-orm";

export interface ExecutorSql {
  execute: (query: SQL) => Promise<unknown>;
}

export const INDICE_UPDATE_ID = "ux_telegram_inbox_chat_update";

export async function aplicarMigracaoUpdateId(exec: ExecutorSql): Promise<void> {
  await exec.execute(sql`
    ALTER TABLE telegram_inbox_messages
      ADD COLUMN IF NOT EXISTS update_id BIGINT
  `);
  await exec.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_telegram_inbox_chat_update
      ON telegram_inbox_messages (chat_id, update_id)
      WHERE update_id IS NOT NULL
  `);
}

export async function reverterMigracaoUpdateId(exec: ExecutorSql): Promise<void> {
  await exec.execute(sql`DROP INDEX IF EXISTS ux_telegram_inbox_chat_update`);
  await exec.execute(sql`ALTER TABLE telegram_inbox_messages DROP COLUMN IF EXISTS update_id`);
}
