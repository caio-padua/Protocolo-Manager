import { logger } from "./logger";
import { consumirAplicacao, reservarProtocolo, type Executor } from "./estoque-reserva";

/** Transação (ou conexão) do drizzle que sabe abrir um ponto de retorno interno. */
type ComPontoDeRetorno = Executor & { transaction<T>(fn: (interna: Executor & ComPontoDeRetorno) => Promise<T>): Promise<T> };

/**
 * Ganchos do estoque dentro de fluxos clínicos. Rodam num ponto de retorno (savepoint): se falharem,
 * só o estoque volta atrás e o registro clínico (agenda, aplicação) segue intacto. A falha vai para o log.
 */
export async function reservarEstoqueDoProtocolo(tx: ComPontoDeRetorno, protocolId: number): Promise<void> {
  try {
    await tx.transaction((s) => reservarProtocolo(s, protocolId));
  } catch (err) {
    logger.error({ err, protocolId }, "estoque: reserva do protocolo falhou; o protocolo seguiu sem reserva");
  }
}

export async function baixarEstoqueDaAplicacao(tx: ComPontoDeRetorno, applicationId: number): Promise<void> {
  try {
    const r = await tx.transaction((s) => consumirAplicacao(s, applicationId));
    if (!r.ok) logger.warn({ applicationId, motivo: r.motivo }, "estoque: baixa da aplicação não registrada");
  } catch (err) {
    logger.error({ err, applicationId }, "estoque: baixa da aplicação falhou; a aplicação seguiu registrada");
  }
}
