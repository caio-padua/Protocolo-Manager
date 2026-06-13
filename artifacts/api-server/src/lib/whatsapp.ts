// Envio de WhatsApp via Twilio REST (server-side). Gated por secrets.
// Quando os secrets não existem, retorna apenas um link wa.me de fallback —
// nunca lança, nunca bloqueia o fluxo de prescrição.
import { logger } from "./logger";

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || process.env.WHATSAPP_FROM;

export function isWhatsappConfigured(): boolean {
  return Boolean(ACCOUNT_SID && AUTH_TOKEN && WHATSAPP_FROM);
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

  if (!isWhatsappConfigured()) {
    return { sent: false, via: "link", link };
  }

  try {
    let toDigits = onlyDigits(phone);
    if (toDigits.length > 0 && !toDigits.startsWith("55") && toDigits.length <= 11) {
      toDigits = `55${toDigits}`;
    }
    const fromNumber = WHATSAPP_FROM!.startsWith("whatsapp:") ? WHATSAPP_FROM! : `whatsapp:+${onlyDigits(WHATSAPP_FROM!)}`;
    const toNumber = `whatsapp:+${toDigits}`;

    const body = new URLSearchParams({
      From: fromNumber,
      To: toNumber,
      Body: message,
    });

    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64"),
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
