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

export interface SendWhatsappOptions {
  /** URL pública de imagem (banner de marca) anexada como mídia da mensagem. */
  mediaUrl?: string;
}

// Consulta o status FINAL da mensagem no Twilio, com no máximo poucas tentativas
// espaçadas (limite total curto). Só devolve erro quando o Twilio CONFIRMA falha
// ("failed"/"undelivered", ex.: 63016 fora da janela de 24h). Se após o limite o
// status ainda for transitório (queued/sending/sent), devolve null: não afirmamos
// falha nem entrega — a mensagem foi aceita (best-effort). Nunca lança.
async function verifyDeliveryFailure(
  accountSid: string,
  authToken: string,
  sid: string,
): Promise<string | null> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${sid}.json`;
  const auth =
    "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(1000);
    try {
      const r = await fetch(url, { headers: { Authorization: auth } });
      if (!r.ok) continue;
      const m = (await r.json().catch(() => ({}))) as {
        status?: string;
        error_code?: number | null;
      };
      if (m.status === "failed" || m.status === "undelivered") {
        return m.error_code ? `twilio_${m.error_code}` : `twilio_${m.status}`;
      }
    } catch {
      // best-effort: falha na verificação não vira falha de entrega
    }
  }
  return null;
}

export async function sendWhatsapp(
  phone: string,
  message: string,
  opts: SendWhatsappOptions = {},
): Promise<WhatsappResult> {
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
    if (opts.mediaUrl && /^https:\/\//.test(opts.mediaUrl)) {
      // Twilio só aceita MediaUrl público via HTTPS; em dev local sem domínio
      // público a imagem é simplesmente omitida (degrade gracioso para texto).
      body.append("MediaUrl", opts.mediaUrl);
    }

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

    // O 2xx do Twilio só diz que a mensagem foi ACEITA (status "queued"), NÃO
    // que foi entregue. A falha por estar fora da janela de 24h do WhatsApp
    // (erro 63016) chega de forma assíncrona, virando status "failed"/
    // "undelivered" segundos depois. Para não fingir entrega (R-B2), lemos o
    // corpo da criação e, se não houver erro imediato, fazemos uma verificação
    // curta e limitada do status final. Se o Twilio confirmar falha, devolvemos
    // sent:false com o código; se não conseguirmos confirmar a tempo, tratamos
    // como aceito (best-effort) — nunca afirmamos entrega sem evidência.
    const created = (await resp.json().catch(() => ({}))) as {
      sid?: string;
      status?: string;
      error_code?: number | null;
    };
    if (created.error_code) {
      const code = `twilio_${created.error_code}`;
      logger.warn({ code, sid: created.sid }, "Twilio WhatsApp erro imediato");
      return { sent: false, via: "twilio", link, error: code };
    }
    if (created.sid) {
      const finalError = await verifyDeliveryFailure(
        accountSid,
        authToken,
        created.sid,
      );
      if (finalError) {
        logger.warn(
          { error: finalError, sid: created.sid },
          "Twilio WhatsApp não entregue (status final)",
        );
        return { sent: false, via: "twilio", link, error: finalError };
      }
    }

    return { sent: true, via: "twilio", link };
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Twilio WhatsApp exception");
    return { sent: false, via: "link", link, error: err?.message ?? String(err) };
  }
}
