// Webhook de STATUS do Twilio (StatusCallback). Provedor externo sem sessão —
// registrado ANTES do portão de colaborador. Autenticidade via assinatura
// X-Twilio-Signature (HMAC-SHA1 base64 da URL pública + parâmetros ordenados,
// assinada com o Auth Token). Assinatura inválida => 403, sem efeito.
//
// O corpo do StatusCallback traz MessageSid + MessageStatus (+ ErrorCode). A
// gente atualiza a linha correspondente em whatsapp_mensagens_log por SID.
// Nunca logamos o token.
import { Router, type IRouter } from "express";
import { db, whatsappMensagensLogTable, lembreteEnviosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getSecret } from "../lib/secure-settings";
import { statusCallbackUrl } from "../lib/whatsapp";
import { assinaturaTwilioValida, statusPodeAvancar } from "../lib/whatsapp-seguranca";

const router: IRouter = Router();

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

  const valida = assinaturaTwilioValida(authToken, assinada, candidatos, params);
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
    // Callbacks chegam fora de ordem: nunca retrocede o estado (delivered não volta a sent;
    // falha atrasada não apaga entrega já confirmada).
    const [atual] = await db
      .select({ id: whatsappMensagensLogTable.id, status: whatsappMensagensLogTable.status })
      .from(whatsappMensagensLogTable)
      .where(eq(whatsappMensagensLogTable.sid, sid))
      .limit(1);
    if (atual && !statusPodeAvancar(atual.status, messageStatus)) {
      res.status(200).json({ ok: true, ignored: "fora_de_ordem" });
      return;
    }
    const [logRow] = await db
      .update(whatsappMensagensLogTable)
      .set(patch)
      .where(eq(whatsappMensagensLogTable.sid, sid))
      .returning({ id: whatsappMensagensLogTable.id });

    // Propaga o status final assíncrono para o lembrete vinculado (se houver). Um
    // envio aceito na hora (ENVIADO) pode falhar depois (undelivered/failed): sem
    // isso, a tela de falhas de lembrete perderia esses casos.
    // NOTA: NÃO gravamos bloqueio de espelho Telegram aqui. O espelho só é
    // disparado após sendWhatsapp confirmar aceitação (verifyDeliveryFailure sem
    // erro); quando o callback chega, o Telegram pode já ter sido enviado. O
    // bloqueio do espelho é registrado exclusivamente nos caminhos síncronos de
    // falha em lib/whatsapp.ts (HTTP error, error_code imediato, verifyDeliveryFailure).
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
