/**
 * Liga o outbox do repasse (telegram-repasse-outbox.ts) ao banco e ao Telegram reais.
 * - repassarComRecuperacao: usado pelo webhook logo após SALVAR a mensagem.
 * - processarRepassesPendentes: tick do worker (cron) que retoma o que ficou pendente/falhou.
 */
import { db } from "@workspace/db";
import { logger } from "./logger";
import { sendTelegram } from "./telegram";
import { repassarMensagemAoCeo, formatarCpfDisplay } from "./telegram-relay-ceo";
import {
  registrarRepasse, tentarRepasse, processarRepassesVencidos, type DepsOutbox, type LinhaRepasse,
} from "./telegram-repasse-outbox";

const deps: DepsOutbox = {
  enviar: (l: LinhaRepasse) =>
    repassarMensagemAoCeo(
      {
        chatIdCeo: l.chat_id_destino, chatIdRemetente: l.chat_id_remetente, clienteId: l.cliente_id,
        nome: l.nome, cpfDisplay: formatarCpfDisplay(l.cpf), texto: l.texto,
      },
      { enviar: sendTelegram, log: logger },
    ),
};

/** Registra o repasse no outbox (idempotente). LANÇA em falha: o chamador decide 500 (reentrega) ou plano B. */
export async function registrarRepasseDuravel(p: { inboxMessageId: number; chatIdDestino: string }): Promise<number> {
  return registrarRepasse(db, p.inboxMessageId, p.chatIdDestino);
}

/** Primeira tentativa logo após o registro. Falha aqui nunca perde nada: o worker retoma. */
export async function tentarRepasseAgora(repasseId: number): Promise<void> {
  try {
    const r = await tentarRepasse(db, repasseId, deps);
    if (r.kind === "tratado" && r.estado !== "aceito_telegram") {
      logger.warn({ repasseId, estado: r.estado }, "[telegram] repasse ao chat de alerta não aceito na 1ª tentativa");
    }
  } catch (err) {
    logger.warn({ repasseId, errorType: err instanceof Error ? err.constructor.name : typeof err }, "[telegram] 1ª tentativa de repasse falhou; o worker retoma");
  }
}

export async function processarRepassesPendentes() {
  const r = await processarRepassesVencidos(db, deps);
  if (r.incertosNovos > 0) logger.warn({ incertos: r.incertosNovos }, "[telegram] repasses marcados incertos (processo caiu durante envio); conferência humana necessária");
  if (r.examinados > 0) logger.info({ examinados: r.examinados, aceitos: r.aceitos, falhas: r.falhas }, "[telegram] retomada de repasses concluída");
  return r;
}
