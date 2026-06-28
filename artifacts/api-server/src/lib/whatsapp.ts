// Envio de WhatsApp via Twilio REST (server-side). Gated por secrets.
// As credenciais vêm do COFRE cifrado (twilio.*); getSecret cai para o env
// (TWILIO_ACCOUNT_SID etc.) quando o cofre está vazio — fallback preservado.
// Quando nada existe, retorna apenas um link wa.me de fallback —
// nunca lança, nunca bloqueia o fluxo de prescrição.
import { logger } from "./logger";
import { getSecret } from "./secure-settings";

interface TwilioCreds {
  accountSid: string | null;
  authToken: string | null;
  whatsappFrom: string | null;
}

// Lê as credenciais do cofre (com fallback de env via getSecret). O campo
// remetente ainda aceita o env legado WHATSAPP_FROM como última opção.
async function loadTwilioCreds(): Promise<TwilioCreds> {
  const [accountSid, authToken, whatsappFromRaw] = await Promise.all([
    getSecret("twilio.accountSid"),
    getSecret("twilio.authToken"),
    getSecret("twilio.whatsappFrom"),
  ]);
  const whatsappFrom = whatsappFromRaw || process.env.WHATSAPP_FROM || null;
  return { accountSid, authToken, whatsappFrom };
}

export async function isWhatsappConfigured(): Promise<boolean> {
  const c = await loadTwilioCreds();
  return Boolean(c.accountSid && c.authToken && c.whatsappFrom);
}

function onlyDigits(phone: string): string {
  return (phone || "").replace(/\D/g, "");
}

// Monta link wa.me universal (sempre disponível como fallback manual).
export function buildWhatsappLink(phone: string, message: string): string {
  let digits = onlyDigits(phone);
  if (digits.length > 0 && !digits.startsWith("55") && digits.length <= 11) {
    digits = `55${digits}`;
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export interface WhatsappResult {
  sent: boolean;
  via: "twilio" | "link";
  link: string;
  error?: string;
}

export async function sendWhatsapp(phone: string, message: string): Promise<WhatsappResult> {
  const link = buildWhatsappLink(phone, message);

  const { accountSid, authToken, whatsappFrom } = await loadTwilioCreds();
  if (!(accountSid && authToken && whatsappFrom)) {
    return { sent: false, via: "link", link };
  }

  try {
    let toDigits = onlyDigits(phone);
    if (toDigits.length > 0 && !toDigits.startsWith("55") && toDigits.length <= 11) {
      toDigits = `55${toDigits}`;
    }
    const fromNumber = whatsappFrom.startsWith("whatsapp:") ? whatsappFrom : `whatsapp:+${onlyDigits(whatsappFrom)}`;
    const toNumber = `whatsapp:+${toDigits}`;

    const body = new URLSearchParams({
      From: fromNumber,
      To: toNumber,
      Body: message,
    });

    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!resp.ok) {
      const text = await resp.text();
      logger.warn({ status: resp.status, text }, "Twilio WhatsApp send failed");
      return { sent: false, via: "link", link, error: `HTTP ${resp.status}` };
    }

    return { sent: true, via: "twilio", link };
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Twilio WhatsApp exception");
    return { sent: false, via: "link", link, error: err?.message ?? String(err) };
  }
}
