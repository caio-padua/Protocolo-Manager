/**
 * Recalcula o lembrete do cliente depois de mudar uma medicação (pausar, editar, excluir, validar,
 * recusar, revogar consentimento). Nunca bloqueia a ação principal e nunca envia mensagem:
 * erro vira log estruturado (sem dados pessoais) e devolve false.
 */
import { pool } from "@workspace/db";
import { itensLembreteDeMedicacoes } from "./cliente-medicacoes.js";
import { recalcularLembreteCore } from "./cliente-medicacao-adesao.js";
import { sincronizarLembretePrescricao } from "./lembrete-periodo.js";
import { brtISODate } from "./brt.js";
import { logger } from "./logger.js";

const DDL_PENDENTE = `CREATE TABLE IF NOT EXISTS cliente_lembrete_recalculo_pendente (
  client_id INTEGER PRIMARY KEY REFERENCES clients(id),
  motivo TEXT NOT NULL, tentativas INTEGER NOT NULL DEFAULT 1,
  falhou_em TIMESTAMPTZ NOT NULL DEFAULT now())`;

/** Há recálculo que falhou e ainda não foi refeito? (visível ao cliente; nunca some em silêncio) */
export async function recalculoPendente(clientId: number): Promise<boolean> {
  try {
    await pool.query(DDL_PENDENTE);
    return (await pool.query(`SELECT 1 FROM cliente_lembrete_recalculo_pendente WHERE client_id=$1`, [clientId])).rows.length > 0;
  } catch { return true; } // não deu para conferir: tratar como pendente, nunca como "ok"
}

/** Recuperação segura: refaz o cálculo (idempotente) se havia falha registrada. */
export async function tentarRecuperarRecalculo(clientId: number): Promise<boolean> {
  if (!(await recalculoPendente(clientId))) return true;
  return recalcularLembreteDoCliente(clientId, "recuperacao_automatica");
}

export async function recalcularLembreteDoCliente(clientId: number, motivo: string): Promise<boolean> {
  try {
    const hoje = brtISODate();
    const itensMedicacao = await itensLembreteDeMedicacoes(pool, clientId, hoje);
    await recalcularLembreteCore(pool, clientId, { hoje, itensMedicacao, sincronizar: sincronizarLembretePrescricao });
    await pool.query(DDL_PENDENTE);
    await pool.query(`DELETE FROM cliente_lembrete_recalculo_pendente WHERE client_id=$1`, [clientId]);
    return true;
  } catch (err) {
    try {
      await pool.query(DDL_PENDENTE);
      await pool.query(
        `INSERT INTO cliente_lembrete_recalculo_pendente (client_id, motivo) VALUES ($1,$2)
         ON CONFLICT (client_id) DO UPDATE SET tentativas = cliente_lembrete_recalculo_pendente.tentativas + 1, motivo = EXCLUDED.motivo, falhou_em = now()`,
        [clientId, motivo]);
    } catch { /* o log abaixo é o último recurso */ }
    logger.error(
      { evento: "lembrete_recalculo_falhou", motivo, clientId, errorType: err instanceof Error ? err.constructor.name : typeof err },
      "Lembrete não recalculado após mudança de medicação",
    );
    return false;
  }
}
