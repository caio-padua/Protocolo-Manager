/**
 * Gravação atômica de mensagem de entrada do Telegram, com deduplicação por
 * update_id. Sem import de @workspace/db: o executor é injetado (testável em
 * banco descartável).
 *
 * Atomicidade: INSERT ... ON CONFLICT DO NOTHING sobre o índice único parcial
 * (chat_id, update_id). Duas entregas simultâneas do mesmo update: o banco
 * serializa; só uma insere, a outra recebe "duplicada". Se a transação da
 * primeira falhar, a segunda insere normalmente (nada é bloqueado em falso).
 */
import { sql, type SQL } from "drizzle-orm";

export interface ExecutorConsulta {
  execute: (query: SQL) => Promise<{ rows: unknown[] }>;
}

export interface GravarEntradaParams {
  empresaId: number;
  clienteId: number;
  chatId: string;
  texto: string;
  /** update_id do Telegram; null/ausente = sem deduplicação (não há chave). */
  updateId?: number | null;
}

export interface GravarEntradaResultado {
  id: number;
  duplicada: boolean;
}

export async function gravarMensagemEntrada(
  exec: ExecutorConsulta,
  p: GravarEntradaParams,
): Promise<GravarEntradaResultado> {
  const updateId = p.updateId ?? null;

  if (updateId === null) {
    const r = await exec.execute(sql`
      INSERT INTO telegram_inbox_messages (empresa_id, cliente_id, chat_id, texto)
      VALUES (${p.empresaId}, ${p.clienteId}, ${p.chatId}, ${p.texto})
      RETURNING id
    `);
    return { id: Number((r.rows[0] as { id: number }).id), duplicada: false };
  }

  const ins = await exec.execute(sql`
    INSERT INTO telegram_inbox_messages (empresa_id, cliente_id, chat_id, texto, update_id)
    VALUES (${p.empresaId}, ${p.clienteId}, ${p.chatId}, ${p.texto}, ${updateId})
    ON CONFLICT (chat_id, update_id) WHERE update_id IS NOT NULL DO NOTHING
    RETURNING id
  `);
  if (ins.rows.length > 0) {
    return { id: Number((ins.rows[0] as { id: number }).id), duplicada: false };
  }

  // Conflito: a linha já existe (commitada por outra entrega). Devolve o id dela.
  const existente = await exec.execute(sql`
    SELECT id FROM telegram_inbox_messages
    WHERE chat_id = ${p.chatId} AND update_id = ${updateId}
    LIMIT 1
  `);
  const id = existente.rows[0] ? Number((existente.rows[0] as { id: number }).id) : 0;
  return { id, duplicada: true };
}

/** Normaliza o update_id do corpo do webhook; inválido => null (sem dedupe, nunca erro). */
export function extrairUpdateId(valor: unknown): number | null {
  return typeof valor === "number" && Number.isSafeInteger(valor) && valor > 0 ? valor : null;
}

const CLASSES_SQLSTATE_TRANSITORIAS = /^(08|40|53|57)/; // conexão, deadlock/serialização, recursos, desligamento
const CODIGOS_REDE_TRANSITORIOS = new Set([
  "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE", "ENOTFOUND", "EAI_AGAIN", "55P03",
]);

/**
 * Falha técnica que pode se resolver sozinha (banco fora, conexão caiu,
 * deadlock). Nesse caso o webhook responde 500 para o Telegram reentregar.
 * Erros de integridade/dados/código (23xxx, 22xxx, 42xxx, TypeError...) são
 * permanentes: reentregar não adianta, então a rota responde 200.
 */
export function erroTransitorioDeBanco(err: unknown): boolean {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = e?.code ?? e?.cause?.code;
  if (typeof code !== "string") return false;
  return CODIGOS_REDE_TRANSITORIOS.has(code) || CLASSES_SQLSTATE_TRANSITORIAS.test(code);
}
