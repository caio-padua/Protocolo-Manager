/**
 * Pendência verificável de vínculo ambíguo: o mesmo chat do Telegram aparece em MAIS DE UM cliente.
 * O sistema NÃO escolhe um deles: guarda a mensagem aqui (nada se perde) e um humano resolve.
 * Tabela aditiva; idempotente por (chat_id, update_id).
 */
import { sql, type SQL } from "drizzle-orm";

export interface ExecutorPendencia {
  execute: (query: SQL) => Promise<{ rows: unknown[] }>;
}

export async function aplicarMigracaoPendenciaVinculo(exec: ExecutorPendencia): Promise<void> {
  await exec.execute(sql`
    CREATE TABLE IF NOT EXISTS telegram_vinculo_pendencias (
      id           BIGSERIAL PRIMARY KEY,
      chat_id      TEXT        NOT NULL,
      update_id    BIGINT,
      candidatos   INTEGER[]   NOT NULL,
      texto        TEXT        NOT NULL,
      criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolvido_em TIMESTAMPTZ,
      resolucao    TEXT
    )
  `);
  await exec.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_telegram_vinculo_pend_chat_update
      ON telegram_vinculo_pendencias (chat_id, update_id) WHERE update_id IS NOT NULL
  `);
}

/** Devolve true quando a pendência é NOVA (false = reentrega já registrada). */
export async function registrarPendenciaVinculo(
  exec: ExecutorPendencia,
  p: { chatId: string; updateId: number | null; candidatos: number[]; texto: string },
): Promise<boolean> {
  const cand = `{${[...new Set(p.candidatos)].sort((a, b) => a - b).join(",")}}`;
  const r = await exec.execute(sql`
    INSERT INTO telegram_vinculo_pendencias (chat_id, update_id, candidatos, texto)
    VALUES (${p.chatId}, ${p.updateId}, ${cand}::int[], ${p.texto})
    ON CONFLICT (chat_id, update_id) WHERE update_id IS NOT NULL DO NOTHING
    RETURNING id
  `);
  return r.rows.length > 0;
}
