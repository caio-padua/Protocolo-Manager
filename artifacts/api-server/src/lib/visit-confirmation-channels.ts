/**
 * Adaptadores REAIS de canal da confirmação por visita (K8).
 * Os testes nunca usam este arquivo: injetam canais simulados em ChannelSenders.
 */
import { sendGmailMessage } from "./google-gmail";
import { sendWhatsapp } from "./whatsapp";
import { sendTelegram } from "./telegram";
import type { ChannelSenders } from "./visit-confirmation";

export const realChannels: ChannelSenders = {
  async sendEmail(to, subject, html) {
    return sendGmailMessage({ to, subject, html });
  },
  async sendWhatsapp(phone, message) {
    // Sem espelho no Telegram (canal próprio) e com o corpo mascarado no log: a chave
    // nunca fica gravada em texto puro em whatsapp_mensagens_log.
    return sendWhatsapp(phone, message, {
      contexto: "chave_visita",
      mirrorTelegram: false,
      corpoParaLog: "[chave de confirmação da visita omitida do log]",
    });
  },
  async sendTelegram(chatId, text) {
    return sendTelegram(chatId, text);
  },
};
