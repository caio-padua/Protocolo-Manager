/**
 * PAXTER — WhatsApp Inbound Webhook (Twilio)
 * Recebe mensagens enviadas PELOS usuários ao sandbox do Twilio e responde
 * via Aurora ADM com contexto clínico real (protocolos, sessões, etc.).
 * Registrado ANTES do portão de colaborador (rota pública, autenticidade
 * verificada via assinatura X-Twilio-Signature).
 */
import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { sendWhatsapp, registrarLogMensagem } from "../lib/whatsapp";
import { getSecret } from "../lib/secure-settings";
import { logger } from "../lib/logger";
import { requireAiTenant } from "../lib/ai-central";
import { assinaturaTwilioValida, autorespostaHabilitada, mascararTelefone } from "../lib/whatsapp-seguranca";
import { contextoClinico, identificarRemetente, type RemetenteIdentificado } from "../lib/whatsapp-identidade";
import { requireCollaborator } from "./collaborator";
import { requirePlatformOwner } from "../middleware/tenantContext.js";

const router: IRouter = Router();

// ── Normaliza telefone vindo do Twilio (whatsapp:+5562...) ────────────────────
function normalizePhone(raw: string): string {
  return raw.replace(/^whatsapp:/i, "").replace(/\D/g, "");
}

// ── Monta system prompt contextualizado ───────────────────────────────────────
// Dado clínico (protocolo/sessões) só entra quando identidade E clínica foram confirmadas.
type ContextoSeguro =
  | { nivel: "clinico"; nome: string; protocolo: string | null; feitas: number; total: number }
  | { nivel: "cliente_sem_clinica_confirmada" }
  | { nivel: "profissional"; nome: string; cargo: string }
  | { nivel: "anonimo" };

function montarSystemPrompt(ctx: ContextoSeguro): string {
  const base = `Você é Aurora ADM, Assistente Administrativa Sênior do sistema PaxMed (Padcon Conect). Você NUNCA chama a clínica de PaxMed: a clínica tem o próprio nome.
TOM: Formal, acolhedor, eficiente. Respostas curtas (máximo 4 parágrafos). Nunca diagnostica.
CANAL: WhatsApp — use texto simples, *negrito* para destaques, emojis com moderação.
VOCÊ NUNCA FAZ: Diagnósticos, prescrições, alterar dados do sistema.
SEMPRE TERMINA: Convidando para a próxima ação ou perguntando se pode ajudar em mais algo.`;

  if (ctx.nivel === "clinico") {
    const progresso = ctx.protocolo
      ? `\nProtocolo ativo: ${ctx.protocolo} — ${ctx.feitas}/${ctx.total} sessões concluídas.`
      : "\nSem protocolo ativo no momento.";
    return base + `\n\nContexto: Falando com ${ctx.nome} (cliente da clínica).${progresso}`;
  }
  if (ctx.nivel === "profissional") {
    return base + `\n\nContexto: Falando com ${ctx.nome} (${ctx.cargo} — equipe interna). Não há dado clínico de clientes neste contexto.`;
  }
  return base + "\n\nObs: Identidade e clínica NÃO confirmadas. NÃO revele nenhuma informação clínica, de agenda, de protocolo ou de cadastro, nem confirme que a pessoa é cliente. Seja cordial e oriente a falar com a recepção da clínica.";
}

async function montarContexto(r: RemetenteIdentificado): Promise<ContextoSeguro> {
  if (r.tipo === "profissional") return { nivel: "profissional", nome: r.nome, cargo: r.cargo };
  if (r.tipo === "cliente") {
    if (!r.clinicaConfirmada || r.empresaId === null) return { nivel: "cliente_sem_clinica_confirmada" };
    const c = await contextoClinico(r.clienteId, r.empresaId);
    return { nivel: "clinico", nome: r.nome, protocolo: c?.protocolo ?? null, feitas: c?.feitas ?? 0, total: c?.total ?? 0 };
  }
  return { nivel: "anonimo" };
}

const TWIML_VAZIO = "<?xml version=\"1.0\"?><Response></Response>";

// ── POST /api/whatsapp/inbound — recebe mensagem do usuário ───────────────────
router.post("/whatsapp/inbound", async (req, res): Promise<void> => {
  const authToken = await getSecret("twilio.authToken");
  // Sem token não há como provar a origem: recusa (fail-closed), em qualquer ambiente.
  if (!authToken) {
    res.status(503).json({ error: "twilio nao configurado" });
    return;
  }

  const params = (req.body ?? {}) as Record<string, string>;
  const proto = (req.header("x-forwarded-proto") || "https").split(",")[0]?.trim();
  const host = (req.header("x-forwarded-host") || req.header("host") || "").split(",")[0]?.trim();
  const candidatos: string[] = [];
  if (host) candidatos.push(`${proto}://${host}/api/whatsapp/inbound`);
  const domain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim();
  if (domain) candidatos.push(`https://${domain}/api/whatsapp/inbound`);

  // Assinatura ausente ou inválida: 403, sem gravar nada, sem consultar paciente, sem responder.
  if (!assinaturaTwilioValida(authToken, req.header("x-twilio-signature"), candidatos, params)) {
    logger.warn({ event: "twilio_inbound_signature_invalid" }, "assinatura ausente ou inválida no inbound WhatsApp");
    res.status(403).json({ error: "assinatura invalida" });
    return;
  }

  const from = params.From ?? "";
  const to = params.To ?? "";
  const body = (params.Body ?? "").trim();
  const sid = params.MessageSid ?? null;

  if (!from || !body) {
    res.status(200).type("text/xml").send(TWIML_VAZIO);
    return;
  }

  logger.info({ from: mascararTelefone(from), bodyLen: body.length }, "[whatsapp/inbound] mensagem recebida");

  // Reenvio do Twilio (mesmo MessageSid): não grava de novo nem responde de novo.
  if (sid) {
    const dup = await pool.query(
      `SELECT 1 FROM whatsapp_mensagens_log WHERE sid = $1 AND direcao = 'entrada' LIMIT 1`, [sid],
    ).catch(() => null);
    if (dup && dup.rows.length > 0) {
      res.status(200).type("text/xml").send(TWIML_VAZIO);
      return;
    }
  }

  // Identidade: número completo e único; clínica pelo canal que recebeu.
  const remetente = await identificarRemetente(from, to).catch((): RemetenteIdentificado => ({ tipo: "desconhecido" }));
  const clienteIdRecebida = remetente.tipo === "cliente" ? remetente.clienteId : null;

  // Grava a mensagem RECEBIDA (conversa unificada e auditoria). O vínculo com o cliente só
  // existe quando a identidade é única; ambíguo/desconhecido fica sem cliente.
  await registrarLogMensagem({
    telefone: normalizePhone(from),
    corpo: body,
    sid,
    status: "received",
    contexto: "inbound",
    clienteId: clienteIdRecebida ?? undefined,
    via: "whatsapp",
    direcao: "entrada",
  });

  // Resposta automática DESLIGADA por padrão (testes): só registra. Liga com
  // WHATSAPP_INBOUND_AUTORESPOSTA=true. Mesmo ligada, o modo teste limita o destino.
  if (!autorespostaHabilitada()) {
    res.status(200).type("text/xml").send(TWIML_VAZIO);
    return;
  }

  const systemPrompt = montarSystemPrompt(await montarContexto(remetente));

  let resposta = "Olá! Recebi sua mensagem. Nossa equipe retornará em breve.";
  const { headers: aiHeaders } = requireAiTenant(0, "whatsapp");
  try {
    const aiR = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: "user", content: body }],
    }, { headers: aiHeaders });
    const txt = (aiR.content[0] as { text?: string })?.text?.trim();
    if (txt) resposta = txt;
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "[whatsapp/inbound] erro ao gerar resposta");
  }

  // Nunca espelha no Telegram: a resposta volta só ao canal em que a pessoa escreveu.
  sendWhatsapp(normalizePhone(from), resposta, {
    contexto: "inbound_reply",
    clienteId: clienteIdRecebida ?? undefined,
    mirrorTelegram: false,
  }).catch((e: unknown) => {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "[whatsapp/inbound] falha ao enviar resposta");
  });

  res.status(200).type("text/xml").send(TWIML_VAZIO);
});

// ── GET /api/whatsapp/inbound/setup — configura a Inbound URL no sandbox ──────
// Altera conta EXTERNA (Twilio): exige colaborador autenticado e dono da plataforma.
router.get("/whatsapp/inbound/setup", requireCollaborator, requirePlatformOwner, async (req, res): Promise<void> => {
  const [accountSid, authToken] = await Promise.all([
    getSecret("twilio.accountSid"),
    getSecret("twilio.authToken"),
  ]);
  if (!accountSid || !authToken) {
    res.status(503).json({ error: "Twilio não configurado" });
    return;
  }

  const domain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim();
  if (!domain) {
    res.status(503).json({ error: "REPLIT_DOMAINS não definido" });
    return;
  }

  const inboundUrl = `https://${domain}/api/whatsapp/inbound`;

  // Tenta configurar via Sandbox resource do Twilio
  try {
    const body = new URLSearchParams({ InboundRequestUrl: inboundUrl });
    const r = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/SandboxConfiguration.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      }
    );
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    logger.info({ inboundUrl, status: r.status, data }, "[whatsapp/inbound/setup] sandbox configurado");
    res.json({ ok: r.ok, inboundUrl, status: r.status, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "[whatsapp/inbound/setup] falha ao configurar sandbox");
    res.status(500).json({ error: msg, inboundUrl });
  }
});

export default router;
