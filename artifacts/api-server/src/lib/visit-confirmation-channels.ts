/**
 * Adaptadores REAIS de canal da confirmação por visita (K8).
 *
 * Código Paxter Art. 66: todo envio passa pelo motor Hermes (lib/messaging). Aqui só se escolhe o
 * canal e se traduz o resultado do motor para o relato por canal da K8; a marca (casco do e-mail,
 * banner, legenda) é aplicada pelo motor. Os testes nunca usam este arquivo: injetam canais
 * simulados em ChannelSenders.
 */
import { enviarMensagemPaxter } from "./messaging/engine";
import type { PaxterCanal, PaxterCanalResultado, PaxterDestino, PaxterDoc } from "./messaging/types";
import type { ChannelSenders } from "./visit-confirmation";

/**
 * No log do WhatsApp a chave nunca fica em texto puro. Só a mensagem da chave segue por
 * WhatsApp, por isso o corpo é sempre omitido neste canal.
 */
export const WHATSAPP_LOG_OMITIDO = "[chave de confirmação da visita omitida do log]";

type OpcoesMotor = { corpoParaLog?: string };

async function viaMotor(
  doc: PaxterDoc, destino: PaxterDestino, canal: PaxterCanal, opcoes: OpcoesMotor,
): Promise<PaxterCanalResultado> {
  const { resultados } = await enviarMensagemPaxter(doc, destino, [canal], opcoes);
  return resultados[0] ?? { canal, sent: false, error: "motor sem resultado" };
}

function criarCanais(opcoes: OpcoesMotor): ChannelSenders {
  return {
    async sendEmail(to, doc) {
      const r = await viaMotor(doc, { email: to }, "EMAIL", opcoes);
      return { success: r.sent, error: r.error };
    },
    async sendWhatsapp(phone, doc) {
      const r = await viaMotor(doc, { telefone: phone }, "WHATSAPP", opcoes);
      return { sent: r.sent, via: r.via ?? "twilio", error: r.error };
    },
    async sendTelegram(chatId, doc) {
      const r = await viaMotor(doc, { telegramChatId: chatId }, "TELEGRAM", opcoes);
      return { sent: r.sent, mock: Boolean(r.mock), error: r.error };
    },
  };
}

/** Canais da chave: o corpo do WhatsApp (que carrega a chave) nunca fica no log. */
export const realChannels: ChannelSenders = criarCanais({ corpoParaLog: WHATSAPP_LOG_OMITIDO });

/** Canais do aviso de aplicação realizada (K10): o texto não é segredo, então o log guarda o corpo real. */
export const realNoticeChannels: ChannelSenders = criarCanais({});
