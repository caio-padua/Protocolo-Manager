/**
 * PAXTER — Agentes × WhatsApp Proativo (Onda F)
 * Envia resumo de conversa por WhatsApp ao fim do Chat Pro.
 * moduleGuard: comunicacao
 * Usa Twilio já configurado — graceful degradation se não configurado.
 */

import { Router, type IRouter } from "express";
import { moduleGuard } from "../middleware/moduleGuard";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { sendWhatsapp, isWhatsappConfigured, buildWhatsappLink } from "../lib/whatsapp";
import { logger } from "../lib/logger";
import { logIntegracao } from "./agentes-integracoes";

const router: IRouter = Router();
router.use(moduleGuard("comunicacao"));

// ─── GET /agentes-wpp/status ──────────────────────────────────────────────────
router.get("/agentes-wpp/status", async (_req, res): Promise<void> => {
  const conf = await isWhatsappConfigured();
  res.json({
    configurado: conf,
    instrucoes: conf ? null : [
      "1. Acesse twilio.com/console → Messaging → WhatsApp Senders",
      "2. Defina os secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN",
      "3. Configure twilio.whatsappFrom no Cofre de Integrações",
    ],
  });
});

// ─── POST /agentes-wpp/notificar — envia WhatsApp de uma conversa ─────────────
router.post("/agentes-wpp/notificar", async (req, res): Promise<void> => {
  const { conversation_id, agente_id, client_id, telefone_destino } = req.body as {
    conversation_id?: number;
    agente_id: number;
    client_id?: number;
    telefone_destino?: string;
  };

  if (!agente_id) { res.status(400).json({ error: "agente_id obrigatório" }); return; }

  // Busca agente
  const agR = await db.execute(sql`
    SELECT nome, emoji, tom_voz, cargo FROM catalogo_agentes WHERE id = ${agente_id}
  `);
  const ag = agR.rows[0] as Record<string, string> | undefined;
  if (!ag) { res.status(404).json({ error: "Agente não encontrado" }); return; }

  // Busca telefone do cliente se não foi passado
  let telefone = telefone_destino;
  let clientName = "Cliente";

  if (client_id && !telefone) {
    const cR = await db.execute(sql`SELECT name, phone FROM clients WHERE id = ${client_id}`);
    const c  = cR.rows[0] as Record<string, string> | undefined;
    telefone   = c?.phone ?? undefined;
    clientName = c?.name  ?? "Cliente";
  }

  if (!telefone) {
    res.status(400).json({ error: "Telefone não encontrado. Passe telefone_destino ou client_id com telefone." });
    return;
  }

  // Busca mensagens da conversa para gerar resumo
  let resumo = "Conversa concluída com sucesso.";
  let proximosPassos = "";

  if (conversation_id) {
    const msgsR = await db.execute(sql`
      SELECT role, content FROM agente_messages
      WHERE conversation_id = ${conversation_id}
      ORDER BY created_at ASC LIMIT 10
    `);
    const msgs = msgsR.rows as Array<Record<string, string>>;

    if (msgs.length > 0) {
      const transcript = msgs
        .map(m => `${m.role === "user" ? "Médico" : ag.nome}: ${(m.content ?? "").slice(0, 300)}`)
        .join("\n");

      try {
        const gptR = await anthropic.messages.create({
          model: "claude-haiku-4-5",
          max_tokens: 256,
          system: `Você é ${ag.nome}. Gere um resumo de 2 linhas da conversa e 2 próximos passos concisos. 
Formato:
RESUMO: [2 linhas]
PASSOS: [passo1] | [passo2]`,
          messages: [{ role: "user", content: transcript }],
        });
        const txt = (gptR.content[0] as { text?: string })?.text ?? "";
        const resumoM = txt.match(/RESUMO:\s*(.+?)(?=PASSOS:|$)/s);
        const passosM = txt.match(/PASSOS:\s*(.+)/s);
        resumo         = resumoM?.[1]?.trim() ?? resumo;
        proximosPassos = passosM?.[1]?.trim() ?? "";
      } catch (err) {
        logger.error({ err }, "agentes-wpp: erro ao gerar resumo");
      }
    }
  }

  // Monta mensagem final
  const linhaPassos = proximosPassos
    ? "\n\n📋 *Próximos passos:*\n" +
      proximosPassos.split("|").map(p => `• ${p.trim()}`).join("\n")
    : "";

  const mensagem = `*PAXTER — ${ag.emoji} ${ag.nome}*
─────────────────────
Olá, ${clientName}! Seguem informações sobre nosso último atendimento.

${resumo}${linhaPassos}

Responda esta mensagem para continuar o atendimento.
_PAXTER Clinical Intelligence System_`;

  const wppConf = await isWhatsappConfigured();

  if (!wppConf) {
    const link = buildWhatsappLink(telefone, mensagem);
    res.json({
      configurado: false,
      mensagem: "WhatsApp não configurado. Use o link de fallback.",
      link_fallback: link,
    });
    return;
  }

  try {
    const r = await sendWhatsapp(telefone, mensagem, { clienteId: client_id });
    logIntegracao({ tipo: "wpp_proativo", client_id, status: r.sent ? "ok" : "falhou", detalhe: { sid: r.sid, via: r.via } }).catch(() => {});
    res.json({ ok: true, sid: r.sid, status: r.status, via: r.via, telefone: telefone.slice(-4).padStart(telefone.length, "*") });
  } catch (err) {
    logger.error({ err }, "agentes-wpp: erro ao enviar");
    logIntegracao({ tipo: "wpp_proativo", client_id, status: "falhou", detalhe: { erro: String(err) } }).catch(() => {});
    const link = buildWhatsappLink(telefone, mensagem);
    res.status(502).json({
      error: "Erro ao enviar WhatsApp",
      detalhe: String(err),
      link_fallback: link,
    });
  }
});

// ─── GET /agentes-wpp/config/:agenteId ───────────────────────────────────────
router.get("/agentes-wpp/config/:agenteId", async (req, res): Promise<void> => {
  const id = Number(req.params.agenteId);
  const r  = await db.execute(sql`
    SELECT wpp_proativo_ativo, email_proativo_ativo
    FROM capacidades_agente WHERE agente_id = ${id}
  `).catch(() => ({ rows: [] }));
  res.json(r.rows[0] ?? { wpp_proativo_ativo: false, email_proativo_ativo: false });
});

export default router;
