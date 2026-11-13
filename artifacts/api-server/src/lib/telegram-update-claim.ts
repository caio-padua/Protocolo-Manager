/**
 * Reivindicação de update do Telegram — deduplicação para TODOS os fluxos do webhook
 * (mensagem de cliente vinculado, /start, link mágico, senha de validação, chat sem
 * vínculo). Chave = (identidade do bot, update_id): o update_id é uma sequência POR BOT,
 * então dois bots (ou dois ambientes) nunca colidem entre si.
 *
 * Estados da linha:
 *   processando — alguém reivindicou e ainda não terminou (ou caiu no meio);
 *   concluido   — o update foi tratado e respondido ao Telegram com sucesso.
 *
 * Regras:
 *   1. Primeira entrega: insere "processando" e processa.
 *   2. Reentrega de update "concluido": ignora (200), sem repetir efeito.
 *   3. Reentrega de update "processando" recente: pede nova tentativa (500), nunca 200,
 *      porque o primeiro processamento ainda pode falhar e a mensagem se perderia.
 *   4. "processando" velho (processo morreu no meio): pode ser reassumido; o dono antigo perde o direito de fechar.
 *   5. Falha técnica passageira: a reivindicação é LIBERADA, para a reentrega processar.
 *
 * Sem import de @workspace/db: o executor é injetado (testável em banco descartável).
 * Aditivo e reversível:  DROP TABLE IF EXISTS telegram_updates_processados;
 */
import { sql, type SQL } from "drizzle-orm";

export interface ExecutorClaim {
  execute: (query: SQL) => Promise<{ rows: unknown[] }>;
}

export type ResultadoClaim = "reivindicado" | "ja_concluido" | "em_andamento";

/** Tempo após o qual um "processando" é considerado abandonado (processo caiu). */
export const CLAIM_VENCE_EM_SEGUNDOS = 120;

export async function aplicarMigracaoClaim(exec: ExecutorClaim): Promise<void> {
  await exec.execute(sql`
    CREATE TABLE IF NOT EXISTS telegram_updates_processados (
      bot_id         TEXT        NOT NULL,
      update_id      BIGINT      NOT NULL,
      estado         TEXT        NOT NULL DEFAULT 'processando'
                     CHECK (estado IN ('processando', 'concluido')),
      dono           TEXT,
      criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (bot_id, update_id)
    )
  `);
  // Tabelas criadas antes da coluna "dono" (identidade da reivindicação) — aditivo e idempotente.
  await exec.execute(sql`ALTER TABLE telegram_updates_processados ADD COLUMN IF NOT EXISTS dono TEXT`);
}

export async function reivindicarUpdate(
  exec: ExecutorClaim,
  botId: string,
  updateId: number,
  /** Identidade desta reivindicação (ex.: UUID). Só quem a detém consegue concluir/liberar. */
  dono: string,
  venceEmSegundos: number = CLAIM_VENCE_EM_SEGUNDOS,
): Promise<ResultadoClaim> {
  const r = await exec.execute(sql`
    INSERT INTO telegram_updates_processados (bot_id, update_id, dono)
    VALUES (${botId}, ${updateId}, ${dono})
    ON CONFLICT (bot_id, update_id) DO UPDATE
      SET estado = 'processando', dono = ${dono}, atualizado_em = NOW()
      WHERE telegram_updates_processados.estado = 'processando'
        AND telegram_updates_processados.atualizado_em < NOW() - make_interval(secs => ${venceEmSegundos})
    RETURNING estado
  `);
  if (r.rows.length > 0) return "reivindicado";

  const atual = await exec.execute(sql`
    SELECT estado FROM telegram_updates_processados
    WHERE bot_id = ${botId} AND update_id = ${updateId}
  `);
  const estado = (atual.rows[0] as { estado?: string } | undefined)?.estado;
  // Linha sumiu entre as duas consultas (liberada por falha transitória): trate como em andamento
  // para pedir nova tentativa, sem perder a mensagem.
  return estado === "concluido" ? "ja_concluido" : "em_andamento";
}

/** Só o dono atual conclui: um processamento antigo (já reassumido por outro) não sobrescreve o novo. */
export async function concluirUpdate(exec: ExecutorClaim, botId: string, updateId: number, dono: string): Promise<void> {
  await exec.execute(sql`
    UPDATE telegram_updates_processados
    SET estado = 'concluido', atualizado_em = NOW()
    WHERE bot_id = ${botId} AND update_id = ${updateId} AND dono = ${dono}
  `);
}

/** Só libera o que ainda está "processando"; um "concluido" nunca volta atrás. */
export async function liberarUpdate(exec: ExecutorClaim, botId: string, updateId: number, dono: string): Promise<void> {
  await exec.execute(sql`
    DELETE FROM telegram_updates_processados
    WHERE bot_id = ${botId} AND update_id = ${updateId} AND estado = 'processando' AND dono = ${dono}
  `);
}

/**
 * Identidade pública do bot = parte numérica antes dos dois-pontos do token.
 * Nunca devolve o token. Sem token/formato inválido => "bot-desconhecido".
 */
export function botIdDoToken(token: string | null | undefined): string {
  const m = typeof token === "string" ? /^(\d{3,20}):/.exec(token.trim()) : null;
  return m ? m[1] : "bot-desconhecido";
}
