// Barrel do Motor Único de Envio Branded — "Hermes Paxter" (Art. 66).
// Porta de entrada: enviarMensagemPaxter(doc, destino, canais, ctx).
export * from "./types";
export { renderPaxterEmail, paxterEmailShell, assuntoPadrao } from "./render-email";
export { renderWhatsappCaption, renderTelegramCaption } from "./render-text";
export { enviarMensagemPaxter, paxterBannerUrl } from "./engine";
export { renderPaxterBannerPng } from "./banner";
export { absoluteBaseUrl, baseUrlFromEnv } from "./base-url";
