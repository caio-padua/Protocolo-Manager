// ============================================================================
// MOTOR — porta única de envio (Art. 66). Recebe um PaxterDoc + destino +
// canais e despacha em e-mail, WhatsApp e Telegram, sempre vestindo a marca e
// devolvendo STATUS HONESTO por canal (enviado/mock/erro/pulado). Nunca lança a
// ponto de quebrar o fluxo de quem chama; cada canal é isolado em try/catch.
// ============================================================================
import { sendGmailMessage } from "../google-gmail";
import { sendWhatsapp } from "../whatsapp";
import { sendTelegramPhoto } from "../telegram";
import { renderPaxterEmail, assuntoPadrao } from "./render-email";
import { renderWhatsappCaption, renderTelegramCaption } from "./render-text";
import { baseUrlFromEnv } from "./base-url";
import type {
  PaxterDoc,
  PaxterDestino,
  PaxterCanal,
  PaxterEnvioContexto,
  PaxterCanalResultado,
  PaxterEnvioResultado,
} from "./types";

/** URL pública do banner de marca (servido pela rota /api/brand). */
export function paxterBannerUrl(baseUrl: string): string {
  return `${baseUrl}/api/brand/paxter-banner.png`;
}

export async function enviarMensagemPaxter(
  doc: PaxterDoc,
  destino: PaxterDestino,
  canais: PaxterCanal[],
  ctx: PaxterEnvioContexto = {},
): Promise<PaxterEnvioResultado> {
  const baseUrl = ctx.baseUrl || baseUrlFromEnv();
  const bannerUrl = paxterBannerUrl(baseUrl);
  const resultados: PaxterCanalResultado[] = [];

  for (const canal of canais) {
    if (canal === "EMAIL") {
      const to = destino.email?.trim();
      if (!to) {
        resultados.push({ canal, sent: false, skipped: true });
        continue;
      }
      try {
        const r = await sendGmailMessage({
          to,
          subject: assuntoPadrao(doc),
          html: renderPaxterEmail(doc, baseUrl),
          attachments: doc.anexos,
        });
        resultados.push({ canal, sent: r.success, via: "gmail", error: r.error });
      } catch (e: unknown) {
        resultados.push({ canal, sent: false, via: "gmail", error: (e as Error)?.message ?? String(e) });
      }
    } else if (canal === "WHATSAPP") {
      const phone = destino.telefone?.trim();
      if (!phone) {
        resultados.push({ canal, sent: false, skipped: true });
        continue;
      }
      try {
        const r = await sendWhatsapp(phone, renderWhatsappCaption(doc), { mediaUrl: bannerUrl });
        resultados.push({ canal, sent: r.sent, via: r.via, link: r.link, error: r.error });
      } catch (e: unknown) {
        resultados.push({ canal, sent: false, via: "twilio", error: (e as Error)?.message ?? String(e) });
      }
    } else if (canal === "TELEGRAM") {
      const chatId = destino.telegramChatId?.trim();
      if (!chatId) {
        resultados.push({ canal, sent: false, skipped: true });
        continue;
      }
      try {
        const r = await sendTelegramPhoto(chatId, bannerUrl, renderTelegramCaption(doc));
        resultados.push({ canal, sent: r.sent, via: "telegram", mock: r.mock, error: r.error });
      } catch (e: unknown) {
        resultados.push({ canal, sent: false, via: "telegram", error: (e as Error)?.message ?? String(e) });
      }
    }
  }

  return { resultados, algumEnviado: resultados.some((r) => r.sent) };
}
