// Envio de WhatsApp via Twilio REST (server-side). Gated por secrets.
// As credenciais vêm do COFRE cifrado (twilio.*); getSecret cai para o env
// (TWILIO_ACCOUNT_SID etc.) quando o cofre está vazio — fallback preservado.
// Quando nada existe, retorna apenas um link wa.me de fallback —
// nunca lança, nunca bloqueia o fluxo de prescrição.
//
// RASTREIO (Onda mensageria): cada envio grava uma linha em whatsapp_mensagens_log
// (com o SID do Twilio e o status inicial) e pede um StatusCallback ao Twilio. O
// status final chega de forma assíncrona no webhook POST /api/whatsapp/status, que
// atualiza a linha por MessageSid. O telefone é guardado inteiro no banco (dado
// nativo do cliente); a API/tela é que mascaram. Nunca logamos o token.
import { db, whatsappMensagensLogTable, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { getSecret } from "./secure-settings";
import { sendTelegram } from "./telegram";

/**
 * Espelha uma mensagem para o Telegram do cliente (fire-and-forget).
 * Não bloqueia o envio via WhatsApp. Fail-safe: ignora erros silenciosamente.
 * Grava uma linha no log com via='telegram' quando a entrega é confirmada.
 */
async function espelharParaTelegram(
  clienteId: number,
  telefone: string,
  message: string,
  contexto?: string,
): Promise<void> {
  try {
    const [c] = await db
      .select({ telegramChatId: clientsTable.telegramChatId })
      .from(clientsTable)
      .where(eq(clientsTable.id, clienteId))
      .limit(1);
    if (c?.telegramChatId) {
      const result = await sendTelegram(c.telegramChatId, message);
      if (result.sent) {
        logger.info({ clienteId }, "[whatsapp→telegram] espelho enviado");
        // Registra no log de mensagens como via='telegram' (só em entrega confirmada).
        await registrarLog({
          telefone,
          corpo: message,
          status: "sent",
          contexto,
          clienteId,
          via: "telegram",
        });
      } else {
        logger.warn({ clienteId, mock: result.mock, error: result.error }, "[whatsapp→telegram] espelho falhou — WhatsApp não afetado");
      }
    }
  } catch (err) {
    logger.warn({ err, clienteId }, "[whatsapp→telegram] falha no espelho — WhatsApp não afetado");
  }
}

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

// URL pública do webhook de status do Twilio (mesma base dos outros webhooks).
// Em dev local sem domínio público, devolve null e o callback é omitido.
export function statusCallbackUrl(): string | null {
  const domain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim();
  if (!domain) return null;
  const base = domain.startsWith("http") ? domain : `https://${domain}`;
  return `${base.replace(/\/$/, "")}/api/whatsapp/status`;
}

export interface WhatsappResult {
  sent: boolean;
  via: "twilio" | "link";
  link: string;
  error?: string;
  /** id da linha em whatsapp_mensagens_log (para vincular ao lembrete). */
  logId?: number;
}

export interface SendWhatsappOptions {
  /** URL pública de imagem (banner de marca) anexada como mídia da mensagem. */
  mediaUrl?: string;
  /** Contexto do envio (ex.: lembrete_prescricao | cockpit | manual). */
  contexto?: string;
  /** Cliente associado (para o rastreio). */
  clienteId?: number;
}

/**
 * Envia APENAS uma mídia (figurinha WebP) via Twilio, sem corpo de texto.
 * Best-effort: nunca lança, nunca bloqueia o fluxo principal.
 * Decisão do CEO (15/07/2026): figurinha vai ao FINAL de cada mensagem.
 */
export async function sendWhatsappStickerOnly(
  phone: string,
  mediaUrl: string,
  opts: Pick<SendWhatsappOptions, "contexto" | "clienteId"> = {},
): Promise<{ sent: boolean; error?: string }> {
  const { accountSid, authToken, whatsappFrom } = await loadTwilioCreds();
  if (!(accountSid && authToken && whatsappFrom)) return { sent: false, error: "sem_credenciais" };
  if (!/^https:\/\//.test(mediaUrl)) return { sent: false, error: "url_invalida" };
  try {
    let toDigits = onlyDigits(phone);
    if (toDigits.length > 0 && !toDigits.startsWith("55") && toDigits.length <= 11) toDigits = `55${toDigits}`;
    const fromNumber = whatsappFrom.startsWith("whatsapp:") ? whatsappFrom : `whatsapp:+${onlyDigits(whatsappFrom)}`;
    const toNumber = `whatsapp:+${toDigits}`;
    const body = new URLSearchParams({ From: fromNumber, To: toNumber, MediaUrl: mediaUrl });
    const callback = statusCallbackUrl();
    if (callback) body.append("StatusCallback", callback);
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
      logger.warn({ status: resp.status, text }, "[whatsapp] figurinha: send falhou");
      return { sent: false, error: `HTTP_${resp.status}` };
    }
    const created = (await resp.json().catch(() => ({}))) as { sid?: string; error_code?: number | null };
    if (created.error_code) return { sent: false, error: `twilio_${created.error_code}` };
    logger.info({ sid: created.sid, contexto: opts.contexto }, "[whatsapp] figurinha enviada");
    return { sent: true };
  } catch (err: any) {
    logger.warn({ err: err?.message }, "[whatsapp] figurinha: exception");
    return { sent: false, error: err?.message ?? String(err) };
  }
}

/**
 * Grava uma linha no log de mensagens (qualquer canal); nunca lança (best-effort).
 * Exportada para que rotas de Telegram direto (cockpit inbox, Radar) também
 * possam registrar envios sem duplicar a lógica.
 */
export async function registrarLogMensagem(args: {
  telefone: string;
  corpo: string;
  sid?: string | null;
  status: string;
  errorCode?: string | null;
  contexto?: string;
  clienteId?: number;
  via?: "whatsapp" | "telegram";
}): Promise<number | undefined> {
  return registrarLog(args);
}

// Grava uma linha no log de mensagens; nunca lança (best-effort). Devolve o id.
async function registrarLog(args: {
  telefone: string;
  corpo: string;
  sid?: string | null;
  status: string;
  errorCode?: string | null;
  contexto?: string;
  clienteId?: number;
  /** Canal de entrega: 'whatsapp' (padrão) ou 'telegram'. */
  via?: "whatsapp" | "telegram";
}): Promise<number | undefined> {
  try {
    const [row] = await db
      .insert(whatsappMensagensLogTable)
      .values({
        clienteId: args.clienteId ?? null,
        telefone: args.telefone,
        corpo: args.corpo,
        sid: args.sid ?? null,
        status: args.status,
        errorCode: args.errorCode ?? null,
        contexto: args.contexto ?? null,
        via: args.via ?? "whatsapp",
      })
      .returning({ id: whatsappMensagensLogTable.id });
    return row?.id;
  } catch (err: any) {
    logger.warn({ err: err?.message }, "falha ao registrar log de mensagem");
    return undefined;
  }
}

async function atualizarLog(
  logId: number | undefined,
  patch: { status?: string; errorCode?: string | null },
): Promise<void> {
  if (!logId) return;
  try {
    await db.update(whatsappMensagensLogTable).set(patch).where(eq(whatsappMensagensLogTable.id, logId));
  } catch (err: any) {
    logger.warn({ err: err?.message, logId }, "falha ao atualizar log de WhatsApp");
  }
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
    // Sem Twilio: registra como "link" (não é falha de entrega, é fallback manual).
    const logId = await registrarLog({
      telefone: phone,
      corpo: message,
      status: "link",
      contexto: opts.contexto,
      clienteId: opts.clienteId,
    });
    return { sent: false, via: "link", link, logId };
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
    // Pede ao Twilio que avise o status final (delivered/failed) no nosso webhook.
    const callback = statusCallbackUrl();
    if (callback) body.append("StatusCallback", callback);

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
      const whatsappError = `HTTP_${resp.status}`;
      const logId = await registrarLog({
        telefone: phone,
        corpo: message,
        status: "failed",
        errorCode: whatsappError,
        contexto: opts.contexto,
        clienteId: opts.clienteId,
      });
      void registrarTelegramBloqueado(phone, message, whatsappError, opts);
      return { sent: false, via: "link", link, error: `HTTP ${resp.status}`, logId };
    }

    // O 2xx do Twilio só diz que a mensagem foi ACEITA (status "queued"), NÃO
    // que foi entregue. A falha por estar fora da janela de 24h do WhatsApp
    // (erro 63016) chega de forma assíncrona, virando status "failed"/
    // "undelivered" segundos depois. Registramos o log com o SID (para o webhook
    // atualizar depois) e, se não houver erro imediato, fazemos uma verificação
    // curta. Nunca afirmamos entrega sem evidência.
    const created = (await resp.json().catch(() => ({}))) as {
      sid?: string;
      status?: string;
      error_code?: number | null;
    };

    const logId = await registrarLog({
      telefone: phone,
      corpo: message,
      sid: created.sid ?? null,
      status: created.status || "queued",
      errorCode: created.error_code ? `twilio_${created.error_code}` : null,
      contexto: opts.contexto,
      clienteId: opts.clienteId,
    });

    if (created.error_code) {
      const code = `twilio_${created.error_code}`;
      logger.warn({ code, sid: created.sid }, "Twilio WhatsApp erro imediato");
      await atualizarLog(logId, { status: "failed", errorCode: code });
      void registrarTelegramBloqueado(phone, message, code, opts);
      return { sent: false, via: "twilio", link, error: code, logId };
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
        await atualizarLog(logId, { status: "failed", errorCode: finalError });
        void registrarTelegramBloqueado(phone, message, finalError, opts);
        return { sent: false, via: "twilio", link, error: finalError, logId };
      }
    }

    // Espelho Telegram: só dispara APÓS o Twilio confirmar aceitação da mensagem
    // (2xx sem error_code e sem falha assíncrona). Falhas do WhatsApp não chegam
    // ao paciente via Telegram de forma silenciosa.
    if (opts.clienteId) void espelharParaTelegram(opts.clienteId, phone, message, opts.contexto);

    return { sent: true, via: "twilio", link, logId };
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Twilio WhatsApp exception");
    const logId = await registrarLog({
      telefone: phone,
      corpo: message,
      status: "failed",
      errorCode: "exception",
      contexto: opts.contexto,
      clienteId: opts.clienteId,
    });
    void registrarTelegramBloqueado(phone, message, "exception", opts);
    return { sent: false, via: "link", link, error: err?.message ?? String(err), logId };
  }
}

/**
 * Grava uma linha no log com via='telegram' e status='bloqueado' para indicar
 * que o espelho Telegram foi impedido por falha do WhatsApp. Fire-and-forget,
 * nunca lança.
 *
 * Pré-condições para gravar:
 *  1. clienteId deve estar presente (sem ele não há espelho possível).
 *  2. O paciente deve ter telegramChatId vinculado — sem chatId nunca haveria
 *     espelho, logo não há bloqueio a registrar.
 * Ambas as condições são verificadas antes de inserir qualquer linha.
 */
async function registrarTelegramBloqueado(
  phone: string,
  message: string,
  whatsappError: string,
  opts: Pick<SendWhatsappOptions, "contexto" | "clienteId">,
): Promise<void> {
  if (!opts.clienteId) return;
  try {
    // Só registra se o paciente tem chatId — sem chatId o espelho nunca seria
    // tentado, e um badge "Telegram bloqueado" seria enganoso.
    const [c] = await db
      .select({ telegramChatId: clientsTable.telegramChatId })
      .from(clientsTable)
      .where(eq(clientsTable.id, opts.clienteId))
      .limit(1);
    if (!c?.telegramChatId) return;

    await registrarLog({
      telefone: phone,
      corpo: message,
      status: "bloqueado",
      errorCode: whatsappError,
      contexto: opts.contexto,
      clienteId: opts.clienteId,
      via: "telegram",
    });
    logger.info(
      { clienteId: opts.clienteId, motivo: whatsappError },
      "[whatsapp→telegram] espelho bloqueado — registrado no histórico",
    );
  } catch (err: any) {
    logger.warn({ err: err?.message }, "[whatsapp→telegram] falha ao registrar bloqueio no histórico");
  }
}
