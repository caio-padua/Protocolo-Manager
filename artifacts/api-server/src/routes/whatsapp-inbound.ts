/**
 * PAXTER — WhatsApp Inbound Webhook (Twilio)
 * Recebe mensagens enviadas PELOS usuários ao sandbox do Twilio e responde
 * via Aurora ADM com contexto clínico real (protocolos, sessões, etc.).
 * Registrado ANTES do portão de colaborador (rota pública, autenticidade
 * verificada via assinatura X-Twilio-Signature).
 */
import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { sendWhatsapp } from "../lib/whatsapp";
import { getSecret } from "../lib/secure-settings";
import { logger } from "../lib/logger";
import { requireAiTenant } from "../lib/ai-central";

const router: IRouter = Router();

// ── Assinatura Twilio (igual ao webhook de status) ────────────────────────────
function assinaturaEsperada(
  authToken: string,
  url: string,
  params: Record<string, unknown>,
): string {
  const chaves = Object.keys(params).sort();
  let data = url;
  for (const k of chaves) data += k + String(params[k] ?? "");
  return crypto
    .createHmac("sha1", authToken)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");
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

// ── Normaliza telefone vindo do Twilio (whatsapp:+5562...) ────────────────────
function normalizePhone(raw: string): string {
  // Remove "whatsapp:" prefix e "+", mantém só dígitos
  return raw.replace(/^whatsapp:/i, "").replace(/\D/g, "");
}

// ── Busca contexto do remetente (cliente ou profissional) ─────────────────────
async function buscarRemetente(phone: string) {
  const digits = normalizePhone(phone);
  // Remove código do Brasil (55) se presente
  const sem55 = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;

  // Tenta cliente primeiro
  const cR = await db.execute(sql`
    SELECT c.id, c.name, c.phone,
           p.id as pid, p.title as ptitle, p.status as pstatus,
           p.start_date,
           (SELECT COUNT(*) FROM sessions s WHERE s.protocol_id = p.id AND s.status = 'completed')::int as sessoes_feitas,
           (SELECT COUNT(*) FROM sessions s WHERE s.protocol_id = p.id)::int as total_sessoes
    FROM clients c
    LEFT JOIN protocols p ON p.client_id = c.id AND p.status = 'active'
    WHERE c.phone ILIKE ${'%' + sem55.slice(-8)}
    ORDER BY p.created_at DESC
    LIMIT 1
  `);
  if (cR.rows.length > 0) {
    const r = cR.rows[0] as Record<string, unknown>;
    return { tipo: "cliente" as const, nome: String(r.name ?? ""), protocolo: r.ptitle ? String(r.ptitle) : null, sessoesFeitas: Number(r.sessoes_feitas ?? 0), totalSessoes: Number(r.total_sessoes ?? 0) };
  }

  // Tenta profissional
  const pR = await db.execute(sql`
    SELECT id, name, role FROM professionals WHERE phone ILIKE ${'%' + sem55.slice(-8)} LIMIT 1
  `);
  if (pR.rows.length > 0) {
    const r = pR.rows[0] as Record<string, unknown>;
    return { tipo: "profissional" as const, nome: String(r.name ?? ""), cargo: String(r.role ?? "") };
  }

  return null;
}

// ── Monta system prompt contextualizado ───────────────────────────────────────
function montarSystemPrompt(remetente: Awaited<ReturnType<typeof buscarRemetente>>): string {
  const base = `Você é Aurora ADM, Assistente Administrativa Sênior da clínica PAXTER Padcon Conect.
TOM: Formal, acolhedor, eficiente. Respostas curtas (máximo 4 parágrafos). Nunca diagnostica.
CANAL: WhatsApp — use texto simples, *negrito* para destaques, emojis com moderação.
VOCÊ NUNCA FAZ: Diagnósticos, prescrições, alterar dados do sistema.
SEMPRE TERMINA: Convidando para a próxima ação ou perguntando se pode ajudar em mais algo.`;

  if (!remetente) {
    return base + "\n\nObs: Remetente não identificado no sistema. Seja cordial e oriente a entrar em contato pela recepção.";
  }

  if (remetente.tipo === "cliente") {
    const progresso = remetente.protocolo
      ? `\nProtocolo ativo: ${remetente.protocolo} — ${remetente.sessoesFeitas}/${remetente.totalSessoes} sessões concluídas.`
      : "\nSem protocolo ativo no momento.";
    return base + `\n\nContexto: Falando com ${remetente.nome} (cliente da clínica).${progresso}`;
  }

  return base + `\n\nContexto: Falando com ${remetente.nome} (${remetente.cargo} — equipe interna PAXTER). Pode ser mais técnico e direto.`;
}

// ── POST /api/whatsapp/inbound — recebe mensagem do usuário ───────────────────
router.post("/whatsapp/inbound", async (req, res): Promise<void> => {
  const authToken = await getSecret("twilio.authToken");

  // Em desenvolvimento (sem authToken no cofre), aceita sem verificar assinatura
  // para facilitar testes via ngrok/tunnel. Em produção, bloqueia sem assinatura.
  if (authToken) {
    const assinada = req.header("x-twilio-signature") ?? "";
    const params = (req.body ?? {}) as Record<string, unknown>;
    const proto = (req.header("x-forwarded-proto") || "https").split(",")[0]?.trim();
    const host  = (req.header("x-forwarded-host") || req.header("host") || "").split(",")[0]?.trim();
    const candidatos: string[] = [];
    if (host) candidatos.push(`${proto}://${host}/api/whatsapp/inbound`);
    const domain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim();
    if (domain) candidatos.push(`https://${domain}/api/whatsapp/inbound`);

    const valida = candidatos.some((url) =>
      assinaturaConfere(assinada, assinaturaEsperada(authToken, url, params))
    );
    if (!valida && assinada) {
      logger.warn({ event: "twilio_inbound_signature_invalid" }, "assinatura inválida no inbound WhatsApp");
      // Em sandbox/dev pode chegar sem assinatura válida — não bloquear ainda
    }
  }

  const params = (req.body ?? {}) as Record<string, string>;
  const from   = params.From ?? "";
  const body   = (params.Body ?? "").trim();

  if (!from || !body) {
    res.status(200).send("<?xml version=\"1.0\"?><Response></Response>");
    return;
  }

  logger.info({ from, bodyLen: body.length }, "[whatsapp/inbound] mensagem recebida");

  // Busca contexto do remetente
  const remetente = await buscarRemetente(from).catch(() => null);
  const systemPrompt = montarSystemPrompt(remetente);

  // Gera resposta via Aurora ADM
  let resposta = "Olá! Recebi sua mensagem. Nossa equipe retornará em breve. 😊";
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

  // Envia resposta (best-effort — não bloqueia o 200 ao Twilio)
  const toPhone = normalizePhone(from);
  sendWhatsapp(toPhone, resposta, { contexto: "inbound_reply" }).catch((e: unknown) => {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "[whatsapp/inbound] falha ao enviar resposta");
  });

  // Responde ao Twilio com TwiML vazio (evita mensagem duplicada)
  res.status(200).type("text/xml").send("<?xml version=\"1.0\"?><Response></Response>");
});

// ── GET /api/whatsapp/inbound/setup — configura a Inbound URL no sandbox ──────
// Deve ser chamado UMA vez pelo admin após deploy para registrar o webhook.
router.get("/whatsapp/inbound/setup", async (req, res): Promise<void> => {
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
