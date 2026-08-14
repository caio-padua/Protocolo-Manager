/**
 * Rotas do motor de Assinatura Remota (Paxter).
 *
 * Dois routers exportados:
 *  - `assinaturaWebhookRouter` (livre): recebe o callback do ZapSign.
 *  - `assinaturasRouter` (protegido): rotas internas atrás de requireCollaborator.
 */

import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, clientsTable, assinaturaTogglesAdminTable, telegramInboxTable } from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import {
  enviarAssinatura,
  receberWebhook,
  listarTimeline,
  obterPdfAssinado,
  processarNotificacoes,
  listarTemplates,
  upsertTemplate,
  type EnviarAssinaturaInput,
  type UpsertTemplateInput,
} from "../lib/assinatura/service";
import {
  consentimentoAtivo,
  assertConsentimento,
  ConsentimentoPendenteError,
} from "../lib/assinatura/consentimento";
import {
  listarClausulas,
  upsertClausula,
  desativarClausula,
  type UpsertClausulaInput,
} from "../lib/assinatura/clausulas";
import { contextoPaciente } from "../lib/assinatura/contexto";
import type { ProvedorCodigo } from "../lib/assinatura/types";
import { logger } from "../lib/logger";
import { getSecret } from "../lib/secure-settings";
import { sendTelegram } from "../lib/telegram.js";
import { postSlackAlert } from "../lib/slack-reporter";
import {
  processarWebhookInbox,
  type ClienteVinculado,
} from "../lib/telegram-inbox-flow";

// ---------------------------------------------------------------------------
// Webhook ZapSign (livre — antes do guard).
// ---------------------------------------------------------------------------
export const assinaturaWebhookRouter: IRouter = Router();

assinaturaWebhookRouter.post("/webhooks/assinatura/:provedor", async (req, res): Promise<void> => {
  const provedor = (req.params.provedor || "zapsign") as ProvedorCodigo;
  if (provedor !== "zapsign") { res.status(404).json({ error: "provedor_desconhecido" }); return; }
  try {
    const rawBody = Buffer.from(JSON.stringify(req.body ?? {}));
    const resultado = await receberWebhook(provedor, rawBody, req.headers as Record<string, string | string[] | undefined>);
    if (resultado.unauthorized) { res.status(401).json({ error: "assinatura_invalida" }); return; }
    if (resultado.transient)    { res.status(503).json({ error: "falha_transitoria", eventoId: resultado.eventoId }); return; }
    res.status(200).json({ ok: true, duplicado: resultado.duplicado, eventoId: resultado.eventoId });
  } catch (err) {
    req.log.error({ err: String(err) }, "[assinatura] erro no webhook");
    res.status(500).json({ error: "erro_webhook" });
  }
});

// ---------------------------------------------------------------------------
// Rotas internas (protegidas).
// ---------------------------------------------------------------------------
const assinaturasRouter: IRouter = Router();

assinaturasRouter.post("/assinaturas/enviar", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const body = (req.body || {}) as EnviarAssinaturaInput;
    if (!body.pacienteId || typeof body.pacienteId !== "number") { res.status(400).json({ error: "pacienteId_obrigatorio" }); return; }
    res.status(200).json(await enviarAssinatura(body));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = msg.startsWith("paciente_nao_encontrado") ? 404 : msg.startsWith("template_nao_encontrado") ? 404 : msg.startsWith("paciente_sem_canal") ? 400 : msg.startsWith("conteudo_ausente") ? 400 : 500;
    req.log.error({ err: msg }, "[assinatura] erro ao enviar");
    res.status(code).json({ error: msg });
  }
});

assinaturasRouter.post("/assinaturas/tcle/enviar", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const body = (req.body || {}) as EnviarAssinaturaInput;
    if (!body.pacienteId || typeof body.pacienteId !== "number") { res.status(400).json({ error: "pacienteId_obrigatorio" }); return; }
    res.status(200).json(await enviarAssinatura({ ...body, templateCodigo: body.templateCodigo ?? "TCLE" }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = msg.startsWith("paciente_nao_encontrado") ? 404 : msg.startsWith("template_nao_encontrado") ? 404 : msg.startsWith("paciente_sem_canal") ? 400 : msg.startsWith("conteudo_ausente") ? 400 : 500;
    req.log.error({ err: msg }, "[assinatura] erro ao enviar TCLE");
    res.status(code).json({ error: msg });
  }
});

assinaturasRouter.get("/assinaturas/timeline", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const pid = Number(req.query["pacienteId"]);
    const pacienteId = Number.isInteger(pid) && pid > 0 ? pid : undefined;
    res.status(200).json({ itens: await listarTimeline({ pacienteId }) });
  } catch (err) {
    req.log.error({ err: String(err) }, "[assinatura] erro na timeline");
    res.status(500).json({ error: "erro_timeline" });
  }
});

assinaturasRouter.get("/assinaturas/consentimento", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const pid = Number(req.query["pacienteId"]);
    if (!Number.isInteger(pid) || pid <= 0) { res.status(400).json({ error: "pacienteId_obrigatorio" }); return; }
    const escopo = typeof req.query["escopo"] === "string" ? req.query["escopo"] : undefined;
    res.status(200).json(await consentimentoAtivo(pid, escopo));
  } catch (err) {
    req.log.error({ err: String(err) }, "[assinatura] erro no consentimento");
    res.status(500).json({ error: "erro_consentimento" });
  }
});

assinaturasRouter.post("/assinaturas/consentimento/assert", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const pid = Number(req.body?.pacienteId);
    if (!Number.isInteger(pid) || pid <= 0) { res.status(400).json({ error: "pacienteId_obrigatorio" }); return; }
    const escopo = typeof req.body?.escopo === "string" ? req.body.escopo : undefined;
    await assertConsentimento(pid, escopo);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof ConsentimentoPendenteError) { res.status(409).json({ error: err.message, escopo: err.escopo }); return; }
    req.log.error({ err: String(err) }, "[assinatura] erro no assert consentimento");
    res.status(500).json({ error: "erro_consentimento" });
  }
});

assinaturasRouter.get("/assinaturas/toggles", requireCollaborator, async (_req, res): Promise<void> => {
  try {
    const [row] = await db
      .select({ travaConsentimentoAtiva: assinaturaTogglesAdminTable.travaConsentimentoAtiva })
      .from(assinaturaTogglesAdminTable)
      .where(eq(assinaturaTogglesAdminTable.id, 1))
      .limit(1);
    res.status(200).json({ travaConsentimentoAtiva: row?.travaConsentimentoAtiva ?? false });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

assinaturasRouter.put("/assinaturas/toggles", requireCollaborator, async (req, res): Promise<void> => {
  const trava = Boolean(req.body?.travaConsentimentoAtiva);
  await db.insert(assinaturaTogglesAdminTable).values({ id: 1, travaConsentimentoAtiva: trava })
    .onConflictDoUpdate({ target: assinaturaTogglesAdminTable.id, set: { travaConsentimentoAtiva: trava } });
  res.status(200).json({ travaConsentimentoAtiva: trava });
});

assinaturasRouter.get("/assinaturas/contexto/:pacienteId", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const pid = Number(req.params.pacienteId);
    if (!Number.isInteger(pid) || pid <= 0) { res.status(400).json({ error: "pacienteId_invalido" }); return; }
    const ctx = await contextoPaciente(pid);
    if (!ctx) { res.status(404).json({ error: "paciente_nao_encontrado" }); return; }
    res.status(200).json(ctx);
  } catch (err) {
    req.log.error({ err: String(err) }, "[assinatura] erro no contexto");
    res.status(500).json({ error: "erro_contexto" });
  }
});

assinaturasRouter.get("/assinaturas/clausulas", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const incluirInativas = req.query.todas === "1" || req.query.todas === "true";
    res.status(200).json({ clausulas: await listarClausulas(incluirInativas) });
  } catch (err) {
    req.log.error({ err: String(err) }, "[assinatura] erro ao listar clausulas");
    res.status(500).json({ error: "erro_clausulas" });
  }
});

assinaturasRouter.post("/assinaturas/clausulas", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const body = (req.body || {}) as UpsertClausulaInput;
    if (!body.codigo || typeof body.codigo !== "string") { res.status(400).json({ error: "codigo_obrigatorio" }); return; }
    res.status(200).json({ clausula: await upsertClausula(body) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("codigo_ausente") || msg.startsWith("conteudo_ausente")) { res.status(400).json({ error: msg }); return; }
    req.log.error({ err: msg }, "[assinatura] erro ao salvar clausula");
    res.status(500).json({ error: "erro_salvar_clausula" });
  }
});

assinaturasRouter.delete("/assinaturas/clausulas/:codigo", requireCollaborator, async (req, res): Promise<void> => {
  try {
    res.status(200).json({ clausula: await desativarClausula(String(req.params.codigo)) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("clausula_nao_encontrada")) { res.status(404).json({ error: msg }); return; }
    req.log.error({ err: msg }, "[assinatura] erro ao desativar clausula");
    res.status(500).json({ error: "erro_desativar_clausula" });
  }
});

assinaturasRouter.get("/assinaturas/templates", requireCollaborator, async (req, res): Promise<void> => {
  try {
    res.status(200).json({ templates: await listarTemplates() });
  } catch (err) {
    req.log.error({ err: String(err) }, "[assinatura] erro ao listar templates");
    res.status(500).json({ error: "erro_templates" });
  }
});

assinaturasRouter.post("/assinaturas/templates", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const body = (req.body || {}) as UpsertTemplateInput;
    if (!body.codigo || typeof body.codigo !== "string") { res.status(400).json({ error: "codigo_obrigatorio" }); return; }
    res.status(200).json({ template: await upsertTemplate(body) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("codigo_ausente") || msg.startsWith("conteudo_ausente")) { res.status(400).json({ error: msg }); return; }
    req.log.error({ err: msg }, "[assinatura] erro ao salvar template");
    res.status(500).json({ error: "erro_salvar_template" });
  }
});

assinaturasRouter.post("/assinaturas/processar-notificacoes", requireCollaborator, async (req, res): Promise<void> => {
  try {
    res.status(200).json(await processarNotificacoes());
  } catch (err) {
    req.log.error({ err: String(err) }, "[assinatura] erro ao processar notificacoes");
    res.status(500).json({ error: "erro_notificacoes" });
  }
});

assinaturasRouter.get("/assinaturas/:id/pdf-assinado", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "id_invalido" }); return; }
    const pdf = await obterPdfAssinado(id);
    if (!pdf) { res.status(404).json({ error: "pdf_assinado_indisponivel" }); return; }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${pdf.filename}"`);
    res.status(200).send(pdf.buffer);
  } catch (err) {
    req.log.error({ err: String(err) }, "[assinatura] erro ao servir pdf assinado");
    res.status(500).json({ error: "erro_pdf" });
  }
});

// ---------------------------------------------------------------------------
// Webhook do TELEGRAM (livre — antes do guard).
// ---------------------------------------------------------------------------
export const telegramWebhookRouter: IRouter = Router();

telegramWebhookRouter.post("/webhooks/telegram", async (req, res): Promise<void> => {
  try {
    const segredoEsperado = await getSecret("telegram.webhookSecret");
    const segredoRecebido = req.header("x-telegram-bot-api-secret-token") || "";
    if (!segredoEsperado || segredoRecebido !== segredoEsperado) {
      logger.warn("[telegram] webhook ignorado: segredo ausente ou divergente");
      res.status(200).json({ ok: true });
      return;
    }

    const update = req.body ?? {};
    const msg = update.message || update.edited_message || {};
    const chatId = msg.chat?.id != null ? String(msg.chat.id) : null;
    if (!chatId) { res.status(200).json({ ok: true }); return; }

    const texto: string = typeof msg.text === "string" ? msg.text.trim() : "";
    const chatIdCEO = process.env["PADAXOR_TELEGRAM_CHAT_ID"] || null;

    // ── PASSO 1: cliente vinculado → Modo INBOX ──────────────────────────────
    const [clienteJaVinculado] = await db
      .select({ id: clientsTable.id, name: clientsTable.name, cpf: clientsTable.cpf, empresaId: clientsTable.empresaId })
      .from(clientsTable)
      .where(eq(clientsTable.telegramChatId, chatId))
      .limit(1);

    if (clienteJaVinculado) {
      if (texto) {
        const cliente: ClienteVinculado = {
          id: clienteJaVinculado.id,
          name: clienteJaVinculado.name,
          empresaId: clienteJaVinculado.empresaId ?? 0,
          cpf: clienteJaVinculado.cpf,
        };

        await processarWebhookInbox(
          { chatId, texto, chatIdCEO },
          {
            findClienteByChatId: async () => cliente,
            insertMensagem: async (params) => {
              const rows = await db.insert(telegramInboxTable).values(params).returning({ id: telegramInboxTable.id });
              return { id: rows[0]?.id ?? 0 };
            },
            notificarCEO: chatIdCEO
              ? async (ceoId, cli, txt) => {
                  const cpfDisplay = (cli.cpf || "00000000000").replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
                  void sendTelegram(ceoId,
                    `💬 <b>Mensagem via Telegram</b>\n\n<b>De:</b> ${cli.name}\n<b>CPF:</b> ${cpfDisplay}\n\n"${txt}"\n\n──────────────────\nResponda em: Cockpit → ${cli.name.split(" ")[0]}`
                  );
                  logger.info({ clienteId: cli.id }, "[telegram] mensagem encaminhada ao CEO");
                }
              : undefined,
          },
        ).catch((err: unknown) => logger.error({ err }, "[telegram] falha ao processar mensagem no inbox"));

        // Notificação Slack — best-effort, só quando CEO já iniciou conversa nas últimas 48h.
        void (async () => {
          try {
            const { rows: saidaRows } = await db.execute(sql`
              SELECT id FROM telegram_inbox_messages
              WHERE cliente_id = ${cliente.id}
                AND direcao = 'saida'
                AND criado_at >= NOW() - INTERVAL '48 hours'
              LIMIT 1
            `);
            if (saidaRows.length > 0) {
              const slackChannel = process.env["PADAXOR_SLACK_CHANNEL_ID"] ?? "C0BLW5S7GQL";
              const trecho = texto.length > 120 ? texto.slice(0, 120) + "…" : texto;
              await postSlackAlert(slackChannel, `💬 *Resposta via Telegram*\n\n*Paciente:* ${cliente.name}\n*Mensagem:* "${trecho}"`);
            }
          } catch (slackErr) {
            logger.warn({ err: slackErr }, "[telegram] falha ao notificar Slack sobre resposta do paciente");
          }
        })();
      }
      res.status(200).json({ ok: true });
      return;
    }

    // ── PASSO 2: cliente não vinculado — tenta vinculação por prova de posse ─
    const candidatos = new Set<string>();
    const textoLimpo = texto.trim().toUpperCase();
    if (textoLimpo) {
      candidatos.add(textoLimpo);
      for (const tok of textoLimpo.split(/\s+/)) if (tok) candidatos.add(tok);
    }

    let alvo: { id: number; name: string } | undefined;
    let ambiguo = false;
    if (candidatos.size > 0) {
      const rows = await db.select({ id: clientsTable.id, name: clientsTable.name, vp: clientsTable.validationPassword }).from(clientsTable);
      const matches = rows.filter((r) => r.vp && candidatos.has(r.vp.trim().toUpperCase()));
      if (matches.length === 1) alvo = { id: matches[0].id, name: matches[0].name };
      else if (matches.length > 1) ambiguo = true;
    }

    if (ambiguo) {
      logger.warn("[telegram] vínculo recusado: senha de validação ambígua (colisão)");
    } else if (alvo) {
      await db.execute(sql`UPDATE clients SET telegram_chat_id = ${chatId}, telegram_vinculado_em = now() WHERE id = ${alvo.id}`);
      logger.info({ clienteId: alvo.id }, "[telegram] chat_id vinculado (prova de posse válida)");
      const primeiroNome = alvo.name.split(" ")[0] || alvo.name;
      void sendTelegram(chatId,
        `🎉 <b>Olá, ${primeiroNome}!</b>\n\nSeu Telegram está agora vinculado ao <b>Instituto Pádua</b>.\n\nA partir de agora você receberá aqui:\n• Lembretes de sessões\n• Resultados de exames\n• Orientações do Dr. Caio\n\nVocê também pode nos enviar mensagens e a equipe receberá.`
      );
      if (chatIdCEO) void sendTelegram(chatIdCEO, `✅ <b>Novo cliente vinculou o Telegram</b>\n\nCliente: ${alvo.name}`);
    } else {
      if (texto) void sendTelegram(chatId,
        `👋 Olá!\n\nPara ativar a comunicação com o <b>Instituto Pádua</b>, envie a sua <b>senha de validação</b> que foi enviada por e-mail ou WhatsApp.\n\nDúvidas? WhatsApp: (11) 94655-4000`
      );
      logger.info("[telegram] update sem prova de posse — instrução enviada ao cliente");
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    req.log.error({ err: String(err) }, "[telegram] erro no webhook");
    res.status(200).json({ ok: true });
  }
});

// ---------------------------------------------------------------------------
// POST /api/telegram/test-inbox
// ---------------------------------------------------------------------------
assinaturasRouter.post("/telegram/test-inbox", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const clienteId = Number(req.body?.clienteId);
    const texto: string = typeof req.body?.texto === "string" ? req.body.texto.trim() : "";
    if (!clienteId || clienteId <= 0) { res.status(400).json({ ok: false, error: "clienteId_invalido", detalhe: "Informe clienteId numérico > 0." }); return; }
    if (!texto) { res.status(400).json({ ok: false, error: "texto_vazio", detalhe: "Informe o campo texto." }); return; }

    const [cliente] = await db
      .select({ id: clientsTable.id, name: clientsTable.name, cpf: clientsTable.cpf, telegramChatId: clientsTable.telegramChatId })
      .from(clientsTable).where(eq(clientsTable.id, clienteId)).limit(1);

    if (!cliente) { res.status(404).json({ ok: false, error: "cliente_nao_encontrado", clienteId }); return; }
    if (!cliente.telegramChatId) {
      res.status(422).json({ ok: false, error: "canal_nao_vinculado", detalhe: `Cliente "${cliente.name}" não possui telegramChatId vinculado.` });
      return;
    }

    const chatIdCEO = process.env["PADAXOR_TELEGRAM_CHAT_ID"] || null;
    if (!chatIdCEO) { res.status(503).json({ ok: false, error: "ceo_chatid_ausente", detalhe: "PADAXOR_TELEGRAM_CHAT_ID não configurado." }); return; }

    const cpfDisplay = (cliente.cpf || "00000000000").replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    const repasse = `💬 <b>Mensagem via Telegram</b>\n\n<b>De:</b> ${cliente.name}\n<b>CPF:</b> ${cpfDisplay}\n\n"${texto}"\n\n──────────────────\nResponda em: Cockpit → ${cliente.name.split(" ")[0]}`;

    const resultado = await sendTelegram(chatIdCEO, repasse);
    logger.info({ clienteId: cliente.id, mock: resultado.mock }, "[telegram] mensagem encaminhada ao CEO");
    const telegramEntregue = resultado.sent && !resultado.mock;

    res.json({
      ok: resultado.sent,
      telegramEntregue,
      mock: resultado.mock,
      erro: resultado.error ?? null,
      cliente: { id: cliente.id, nome: cliente.name, cpfDisplay, telegramChatId: cliente.telegramChatId },
      ceoChatId: `${chatIdCEO.slice(0, 3)}***`,
      descricao: telegramEntregue
        ? "Repasse enviado ao CEO com sucesso."
        : resultado.mock
          ? "MOCK: token do bot ausente no cofre."
          : `Falha na entrega (Telegram API): ${resultado.error}`,
    });
  } catch (err) {
    req.log.error({ err: String(err) }, "[telegram] erro no test-inbox");
    res.status(500).json({ ok: false, error: "erro_interno", detalhe: String(err) });
  }
});

// ---------------------------------------------------------------------------
// GET /api/telegram/webhook-status
// ---------------------------------------------------------------------------
assinaturasRouter.get("/telegram/webhook-status", requireCollaborator, async (_req, res): Promise<void> => {
  try {
    const { checkWebhookHealth } = await import("../lib/telegram-webhook-guard.js");
    const result = await checkWebhookHealth();
    if (result.mock) { res.status(400).json({ ok: false, error: "token_ausente", descricao: "Token do bot não configurado no cofre." }); return; }
    if (result.fetchError) { res.status(503).json({ ok: false, error: result.fetchError, descricao: "Falha ao consultar o Telegram." }); return; }
    res.json({ ok: true, healthy: result.healthy, url: result.url, pendingUpdateCount: result.pendingUpdateCount, lastErrorMessage: result.lastErrorMessage ?? null, checkedAt: result.checkedAt });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// GET /api/cert/metadata
assinaturasRouter.get("/cert/metadata", async (_req, res): Promise<void> => {
  try {
    const { getCertInfo } = await import("../lib/pdf-signer.js");
    const info = getCertInfo();
    res.json({ titular: info.subject ?? null, cpf: info.cpf ?? null, validade: info.validTo ?? null, emissor: info.issuer ?? null, serial: info.serial ?? null, tipo: "A1 ICP-Brasil", ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default assinaturasRouter;
