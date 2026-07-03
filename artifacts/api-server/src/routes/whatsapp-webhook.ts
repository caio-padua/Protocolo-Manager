// Webhook de STATUS do Twilio (StatusCallback). Provedor externo sem sessão —
// registrado ANTES do portão de colaborador. Autenticidade via assinatura
// X-Twilio-Signature (HMAC-SHA1 base64 da URL pública + parâmetros ordenados,
// assinada com o Auth Token). Assinatura inválida => 403, sem efeito.
//
// O corpo do StatusCallback traz MessageSid + MessageStatus (+ ErrorCode). A
// gente atualiza a linha correspondente em whatsapp_mensagens_log por SID.
// Nunca logamos o token.
import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { db, whatsappMensagensLogTable, lembreteEnviosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getSecret } from "../lib/secure-settings";
import { statusCallbackUrl } from "../lib/whatsapp";

const router: IRouter = Router();

// Reconstrói a string canônica do Twilio: URL + (para cada chave em ordem
// alfabética) chave concatenada com valor, sem separadores. HMAC-SHA1 base64.
function assinaturaEsperada(authToken: string, url: string, params: Record<string, unknown>): string {
  const chaves = Object.keys(params).sort();
  let data = url;
  for (const k of chaves) {
    data += k + String(params[k] ?? "");
  }
  return crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

function assinaturaConfere(assinada: string, esperada: string): boolean {
  try {
    const a = Buffer.from(assinada);
    const b = Buffer.from(esperada);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

router.post("/whatsapp/status", async (req, res): Promise<void> => {
  const authToken = await getSecret("twilio.authToken");
  if (!authToken) {
    // Sem token não há como verificar autenticidade — não processa.
    res.status(503).json({ error: "twilio nao configurado" });
    return;
  }

  const assinada = req.header("x-twilio-signature") || "";
  const params = (req.body ?? {}) as Record<string, unknown>;

  // A URL tem de bater EXATAMENTE com a StatusCallback usada no envio. A canônica
  // é a nossa statusCallbackUrl(); como fallback (proxy/domínio publicado),
  // reconstruímos pelos cabeçalhos encaminhados.
  const candidatos: string[] = [];
  const canonica = statusCallbackUrl();
  if (canonica) candidatos.push(canonica);
  const proto = (req.header("x-forwarded-proto") || "https").split(",")[0]?.trim();
  const host = (req.header("x-forwarded-host") || req.header("host") || "").split(",")[0]?.trim();
  if (host) candidatos.push(`${proto}://${host}/api/whatsapp/status`);

  const valida = candidatos.some((url) => assinaturaConfere(assinada, assinaturaEsperada(authToken, url, params)));
  if (!valida) {
    req.log?.warn?.({ event: "twilio_status_signature_invalid" }, "assinatura invalida no webhook Twilio");
    res.status(403).json({ error: "assinatura invalida" });
    return;
  }

  const sid = typeof params.MessageSid === "string" ? params.MessageSid : undefined;
  const messageStatus = typeof params.MessageStatus === "string" ? params.MessageStatus : undefined;
  const errorCode = params.ErrorCode != null && String(params.ErrorCode).trim() ? `twilio_${params.ErrorCode}` : null;
  if (!sid || !messageStatus) {
    // Nada acionável, mas não derruba o Twilio (evita reenvio infinito).
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  try {
    const falhaFinal = messageStatus === "failed" || messageStatus === "undelivered";
    const patch: { status: string; errorCode?: string | null } = { status: messageStatus };
    if (falhaFinal) {
      patch.errorCode = errorCode ?? `twilio_${messageStatus}`;
    } else if (errorCode) {
      patch.errorCode = errorCode;
    }
    const [logRow] = await db
      .update(whatsappMensagensLogTable)
      .set(patch)
      .where(eq(whatsappMensagensLogTable.sid, sid))
      .returning({ id: whatsappMensagensLogTable.id });

    // Propaga o status final assíncrono para o lembrete vinculado (se houver). Um
    // envio aceito na hora (ENVIADO) pode falhar depois (undelivered/failed): sem
    // isso, a tela de falhas de lembrete perderia esses casos.
    if (falhaFinal && logRow?.id != null) {
      await db
        .update(lembreteEnviosTable)
        .set({ status: "FALHOU", erro: patch.errorCode ?? `twilio_${messageStatus}` })
        .where(eq(lembreteEnviosTable.whatsappLogId, logRow.id));
    }
  } catch (err) {
    req.log?.error?.({ err: String(err) }, "falha ao atualizar status do WhatsApp");
    // Best-effort: devolve 200 mesmo assim (o dado não é crítico o suficiente
    // para forçar o Twilio a martelar reenvios).
  }

  res.status(200).json({ ok: true });
});

export default router;
