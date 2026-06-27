/**
 * Canal Telegram (Paxter) — NATIVO, com modo MOCK automático.
 *
 * Linha vermelha do CEO: NUNCA logar nem expor o valor do token. O token vive
 * no cofre cifrado (chave `telegram.botToken`) e é hidratado para process.env
 * sob demanda. Sem token, o canal opera em MOCK (loga só destino + tamanho da
 * mensagem) — o boot e a fila de notificação nunca caem por falta de segredo.
 */

import { logger } from "./logger";
import { getSecret } from "./secure-settings";

let _tokenCarregado = false;
async function ensureTelegramTokenLoaded(): Promise<void> {
  if (_tokenCarregado) return;
  _tokenCarregado = true;
  if (process.env["TELEGRAM_BOT_TOKEN"]) return;
  try {
    const tok = await getSecret("telegram.botToken");
    if (tok && tok.trim()) process.env["TELEGRAM_BOT_TOKEN"] = tok.trim();
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[telegram] falha ao ler token do cofre");
  }
}

/** True quando há token configurado (cofre ou env). Nunca expõe o valor. */
export async function isTelegramConfigured(): Promise<boolean> {
  await ensureTelegramTokenLoaded();
  return Boolean(process.env["TELEGRAM_BOT_TOKEN"]);
}

export interface TelegramResult {
  sent: boolean;
  mock: boolean;
  error?: string;
}

/** Envia texto a um chat. MOCK quando sem token (nunca falha por isso). */
export async function sendTelegram(chatId: string, text: string): Promise<TelegramResult> {
  await ensureTelegramTokenLoaded();
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) {
    // MOCK: registra só metadados — JAMAIS o token.
    logger.info({ chatId, len: text.length }, "[telegram] MOCK envio (sem token no cofre)");
    return { sent: true, mock: true };
  }
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    });
    if (!resp.ok) {
      const corpo = await resp.text().catch(() => "");
      return { sent: false, mock: false, error: `telegram_http_${resp.status}: ${corpo.slice(0, 140)}` };
    }
    return { sent: true, mock: false };
  } catch (e) {
    return { sent: false, mock: false, error: (e as Error).message };
  }
}
