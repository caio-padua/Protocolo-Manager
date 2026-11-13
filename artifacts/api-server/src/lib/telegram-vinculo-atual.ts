import { sql, type SQL } from "drizzle-orm";

interface ExecutorVinculo {
  execute(query: SQL): Promise<{ rows: unknown[] }>;
}

/** Consulta global intencional: um chat duplicado em outra empresa também é ambíguo.
 * Não devolve os outros cadastros nem permite escolher o primeiro.
 * Erros de persistência propagam: indisponibilidade nunca concede autorização.
 */
export async function vinculoTelegramAtualUnico(
  exec: ExecutorVinculo,
  esperado: { clienteId: number; empresaId: number; chatId: string },
): Promise<boolean> {
  if (!Number.isSafeInteger(esperado.clienteId) || esperado.clienteId <= 0
    || !Number.isSafeInteger(esperado.empresaId) || esperado.empresaId <= 0
    || !esperado.chatId.trim()) return false;
  const r = await exec.execute(sql`
    SELECT id, empresa_id FROM clients
    WHERE telegram_chat_id = ${esperado.chatId}
    LIMIT 2
  `);
  if (r.rows.length !== 1) return false;
  const atual = r.rows[0] as { id: number | string; empresa_id: number | string };
  return Number(atual.id) === esperado.clienteId
    && Number(atual.empresa_id) === esperado.empresaId;
}
