/**
 * Rotas do motor de Assinatura Remota (Paxter).
 *
 * Dois routers exportados:
 *  - `assinaturaWebhookRouter` (livre): recebe o callback do ZapSign.
 *  - `assinaturasRouter` (protegido): rotas internas atrás de requireCollaborator.
 */

import { Router, type IRouter } from "express";
import { and, desc, eq, like, sql } from "drizzle-orm";
import {
  db,
  clientsTable,
  assinaturaTogglesAdminTable,
  assinaturaSolicitacoesTable,
  assinaturaTemplatesTable,
  telegramInboxTable,
} from "@workspace/db";
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
// Webhook ZapSign (livre — registrado antes do guard).
// ---------------------------------------------------------------------------
export const assinaturaWebhookRouter: IRouter = Router();

// Escopo da Onda F: somente ZapSign está cabeado e testado.
assinaturaWebhookRouter.post("/webhooks/assinatura/:provedor", async (req, res): Promise<void> => {
  const provedor = (req.params.provedor || "zapsign") as ProvedorCodigo;
  if (provedor !== "zapsign") {
    res.status(404).json({ error: "provedor_desconhecido" });
    return;
  }
  try {
    const rawBody = Buffer.from(JSON.stringify(req.body ?? {}));
    const headers = req.headers as Record<string, string | string[] | undefined>;
    const resultado = await receberWebhook(provedor, rawBody, headers);
    if (resultado.unauthorized) {
      res.status(401).json({ error: "assinatura_invalida" });
      return;
    }
    if (resultado.transient) {
      res.status(503).json({ error: "falha_transitoria", eventoId: resultado.eventoId });
      return;
    }
    res.status(200).json({ ok: true, duplicado: resultado.duplicado, eventoId: resultado.eventoId });
  } catch (err) {
    req.log.error({ err: String(err) }, "[assinatura] erro no webhook");
    res.status(500).json({ error: "erro_webhook" });
  }
});

// ---------------------------------------------------------------------------
// Rotas internas (protegidas por requireCollaborator).
// ---------------------------------------------------------------------------
const assinaturasRouter: IRouter = Router();

assinaturasRouter.post("/assinaturas/enviar", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const body = (req.body || {}) as EnviarAssinaturaInput;
    if (!body.pacienteId || typeof body.pacienteId !== "number") {
      res.status(400).json({ error: "pacienteId_obrigatorio" });
      return;
    }
    const resultado = await enviarAssinatura(body);
    res.status(200).json(resultado);
  } catch (err) {
    const msg = (err as Error).message || String(err);
    const code =
      msg.includes("paciente_nao_encontrado") ? 404 :
      msg.includes("template_nao_encontrado") ? 404 :
      msg.includes("paciente_sem_canal") ? 400 : 500;
    req.log.error({ err: msg }, "[assinatura] erro ao enviar");
    res.status(code).json({ error: msg });
  }
});

// Atalho de conveniência para TCLE (Termo de Consentimento Livre e Esclarecido).
assinaturasRouter.post("/assinaturas/tcle/enviar", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const body = (req.body || {}) as EnviarAssinaturaInput;
    if (!body.pacienteId || typeof body.pacienteId !== "number") {
      res.status(400).json({ error: "pacienteId_obrigatorio" });
      return;
    }
    const resultado = await enviarAssinatura({ ...body, templateCodigo: body.templateCodigo ?? "TCLE" });
    res.status(200).json(resultado);
  } catch (err) {
    const msg = (err as Error).message || String(err);
    const code =
      msg.includes("paciente_nao_encontrado") ? 404 :
      msg.includes("template_nao_encontrado") ? 404 :
      msg.includes("paciente_sem_canal") ? 400 : 500;
    req.log.error({ err: msg }, "[assinatura] erro ao enviar TCLE");
    res.status(code).json({ error: msg });
  }
});

assinaturasRouter.get("/assinaturas/timeline", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const pid = Number(req.query.pacienteId);
    const pacienteId = Number.isInteger(pid) && pid > 0 ? pid : undefined;
    const itens = await listarTimeline({ pacienteId });
    res.status(200).json({ itens });
  } catch (err) {
    req.log.error({ err: String(err) }, "[assinatura] erro na timeline");
    res.status(500).json({ error: "erro_timeline" });
  }
});

// --- Onda 4: CONSENTIMENTO (selo + trava aditiva) -------------------------
assinaturasRouter.get("/assinaturas/consentimento", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const pid = Number(req.query.pacienteId);
    if (!Number.isInteger(pid) || pid <= 0) {
      res.status(400).json({ error: "pacienteId_obrigatorio" });
      return;
    }
    const escopo = typeof req.query.escopo === "string" ? req.query.escopo : undefined;
    const status = await consentimentoAtivo(pid, escopo);
    res.status(200).json(status);
  } catch (err) {
    req.log.error({ err: String(err) }, "[assinatura] erro no consentimento");
    res.status(500).json({ error: "erro_consentimento" });
  }
});

assinaturasRouter.post("/assinaturas/consentimento/assert", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const pid = Number(req.body?.pacienteId ?? req.query.pacienteId);
    if (!Number.isInteger(pid) || pid <= 0) {
      res.status(400).json({ error: "pacienteId_obrigatorio" });
      return;
    }
    const escopo = typeof req.body?.escopo === "string" ? req.body.escopo : undefined;
    await assertConsentimento(pid, escopo);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof ConsentimentoPendenteError) {
      res.status(409).json({ error: err.message, escopo: err.escopo });
      return;
    }
    req.log.error({ err: String(err) }, "[assinatura] erro no assert consentimento");
    res.status(500).json({ error: "erro_consentimento" });
  }
});

// Toggle da trava (singleton id=1). GET status / PUT liga-desliga (aditivo).
assinaturasRouter.get("/assinaturas/toggles", requireCollaborator, async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(assinaturaTogglesAdminTable)
      .where(eq(assinaturaTogglesAdminTable.id, 1))
      .limit(1);
    const trava = Boolean(rows[0]?.travaConsentimentoAtiva ?? false);
    res.status(200).json({ travaConsentimentoAtiva: trava });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

assinaturasRouter.put("/assinaturas/toggles", requireCollaborator, async (req, res): Promise<void> => {
  const trava = Boolean(req.body?.travaConsentimentoAtiva);
  await db
    .insert(assinaturaTogglesAdminTable)
    .values({ id: 1, travaConsentimentoAtiva: trava })
    .onConflictDoUpdate({
      target: assinaturaTogglesAdminTable.id,
      set: { travaConsentimentoAtiva: trava },
    });
  res.status(200).json({ travaConsentimentoAtiva: trava });
});

// --- Onda 5: CONTEXTO DO PACIENTE (somente leitura) -----------------------
assinaturasRouter.get("/assinaturas/contexto/:pacienteId", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const pid = Number(req.params.pacienteId);
    if (!Number.isInteger(pid) || pid <= 0) {
      res.status(400).json({ error: "pacienteId_invalido" });
      return;
    }
    const ctx = await contextoPaciente(pid);
    if (!ctx) {
      res.status(404).json({ error: "paciente_nao_encontrado" });
      return;
    }
    res.status(200).json(ctx);
  } catch (err) {
    req.log.error({ err: String(err) }, "[assinatura] erro no contexto");
    res.status(500).json({ error: "erro_contexto" });
  }
});

// --- Onda 5: CLÁUSULAS (CRUD) ---------------------------------------------
assinaturasRouter.get("/assinaturas/clausulas", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const incluirInativas = req.query.todas === "1" || req.query.todas === "true";
    const clausulas = await listarClausulas(incluirInativas);
    res.status(200).json({ clausulas });
  } catch (err) {
    req.log.error({ err: String(err) }, "[assinatura] erro ao listar clausulas");
    res.status(500).json({ error: "erro_clausulas" });
  }
});

assinaturasRouter.post("/assinaturas/clausulas", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const body = (req.body || {}) as UpsertClausulaInput;
    if (!body.codigo || typeof body.codigo !== "string") {
      res.status(400).json({ error: "codigo_obrigatorio" });
      return;
    }
    const clausula = await upsertClausula(body);
    res.status(200).json({ clausula });
  } catch (err) {
    const msg = (err as Error).message || String(err);
    if (msg.includes("codigo_ausente") || msg.includes("conteudo_ausente")) {
      res.status(400).json({ error: msg });
      return;
    }
    req.log.error({ err: msg }, "[assinatura] erro ao salvar clausula");
    res.status(500).json({ error: "erro_salvar_clausula" });
  }
});

assinaturasRouter.delete("/assinaturas/clausulas/:codigo", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const clausula = await desativarClausula(String(req.params.codigo));
    res.status(200).json({ clausula });
  } catch (err) {
    const msg = (err as Error).message || String(err);
    if (msg.includes("clausula_nao_encontrada")) {
      res.status(404).json({ error: msg });
      return;
    }
    req.log.error({ err: msg }, "[assinatura] erro ao desativar clausula");
    res.status(500).json({ error: "erro_desativar_clausula" });
  }
});

assinaturasRouter.get("/assinaturas/templates", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const templates = await listarTemplates();
    res.status(200).json({ templates });
  } catch (err) {
    req.log.error({ err: String(err) }, "[assinatura] erro ao listar templates");
    res.status(500).json({ error: "erro_templates" });
  }
});

assinaturasRouter.post("/assinaturas/templates", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const body = (req.body || {}) as UpsertTemplateInput;
    if (!body.codigo || typeof body.codigo !== "string") {
      res.status(400).json({ error: "codigo_obrigatorio" });
      return;
    }
    const template = await upsertTemplate(body);
    res.status(200).json({ template });
  } catch (err) {
    const msg = (err as Error).message || String(err);
    if (msg.includes("codigo_ausente") || msg.includes("conteudo_ausente")) {
      res.status(400).json({ error: msg });
      return;
    }
    req.log.error({ err: msg }, "[assinatura] erro ao salvar template");
    res.status(500).json({ error: "erro_salvar_template" });
  }
});

assinaturasRouter.post("/assinaturas/processar-notificacoes", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const r = await processarNotificacoes();
    res.status(200).json(r);
  } catch (err) {
    req.log.error({ err: String(err) }, "[assinatura] erro ao processar notificacoes");
    res.status(500).json({ error: "erro_notificacoes" });
  }
});

// ---------------------------------------------------------------------------
// Cadernos de entrega do protocolo (escopo RAS_FAP_ENTREGA*) — Task #194.
// Lista os registros de assinatura_solicitacoes com escopo RAS_FAP_ENTREGA*
// para um dado paciente — visibilidade do CEO no Cockpit.
// ---------------------------------------------------------------------------
assinaturasRouter.get("/assinaturas/solicitacoes-entrega", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const pid = Number(req.query.pacienteId);
    if (!Number.isInteger(pid) || pid <= 0) {
      res.status(400).json({ error: "pacienteId_obrigatorio" });
      return;
    }
    const rows = await db
      .select()
      .from(assinaturaSolicitacoesTable)
      .where(
        and(
          eq(assinaturaSolicitacoesTable.pacienteId, pid),
          like(assinaturaSolicitacoesTable.escopo, "RAS_FAP_ENTREGA%"),
        ),
      );
    res.status(200).json({ cadernos: rows });
  } catch (err) {
    req.log.error({ err: String(err) }, "[assinatura] erro ao listar cadernos de entrega");
    res.status(500).json({ error: "erro_cadernos_entrega" });
  }
});

// Reenvio de caderno de ENTREGA em status REJEITADO ou EXPIRADO.
// Reconstrói o envio a partir dos dados persistidos (dadosHidratacao,
// signatariosSnapshot) para não perder placeholders e signatários originais.
// Restrito a escopo RAS_FAP_ENTREGA* para evitar reenvio acidental de outros documentos.
assinaturasRouter.post("/assinaturas/:id/reenviar", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "id_invalido" });
      return;
    }

    // Restringe ao escopo de cadernos de entrega de protocolo.
    const rows = await db
      .select()
      .from(assinaturaSolicitacoesTable)
      .where(
        and(
          eq(assinaturaSolicitacoesTable.id, id),
          like(assinaturaSolicitacoesTable.escopo, "RAS_FAP_ENTREGA%"),
        ),
      )
      .limit(1);
    const sol = rows[0];
    if (!sol) {
      res.status(404).json({ error: "solicitacao_nao_encontrada_ou_fora_do_escopo" });
      return;
    }
    if (!["REJEITADO", "EXPIRADO"].includes(sol.status.toUpperCase())) {
      res.status(409).json({ error: "status_nao_reenviavel", status: sol.status });
      return;
    }
    if (!sol.pacienteId) {
      res.status(400).json({ error: "solicitacao_sem_paciente" });
      return;
    }

    // Descobre o templateCodigo a partir do templateId original.
    let templateCodigo: string | undefined;
    if (sol.templateId) {
      const tplRows = await db
        .select({ codigo: assinaturaTemplatesTable.codigo })
        .from(assinaturaTemplatesTable)
        .where(eq(assinaturaTemplatesTable.id, sol.templateId))
        .limit(1);
      templateCodigo = tplRows[0]?.codigo;
    }
    if (!templateCodigo) {
      res.status(400).json({ error: "template_nao_encontrado" });
      return;
    }

    // Reconstrói os dados de hidratação originais (placeholders do protocolo).
    const dadosOriginais =
      sol.dadosHidratacao && typeof sol.dadosHidratacao === "object" && !Array.isArray(sol.dadosHidratacao)
        ? (sol.dadosHidratacao as Record<string, string>)
        : undefined;

    // Detecta se o envio original incluía o médico como signatário.
    const snapshot = Array.isArray(sol.signatariosSnapshot) ? sol.signatariosSnapshot : [];
    const incluirMedico = snapshot.some(
      (s: unknown) =>
        typeof s === "object" && s !== null && (s as Record<string, unknown>)["papel"] === "MEDICO",
    );

    const resultado = await enviarAssinatura({
      pacienteId: sol.pacienteId,
      templateCodigo,
      dados: dadosOriginais,
      incluirMedico,
      tipoDoc: "RAS",
      escopo: sol.escopo ?? undefined,
    });
    res.status(200).json(resultado);
  } catch (err) {
    const msg = (err as Error).message || String(err);
    const code =
      msg.includes("paciente_nao_encontrado") ? 404 :
      msg.includes("template_nao_encontrado") ? 404 :
      msg.includes("paciente_sem_canal") ? 400 : 500;
    req.log.error({ err: msg }, "[assinatura] erro ao reenviar caderno");
    res.status(code).json({ error: msg });
  }
});

assinaturasRouter.get("/assinaturas/:id/pdf-assinado", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "id_invalido" });
      return;
    }
    const pdf = await obterPdfAssinado(id);
    if (!pdf) {
      res.status(404).json({ error: "pdf_assinado_indisponivel" });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${pdf.filename}"`);
    res.status(200).send(pdf.buffer);
  } catch (err) {
    req.log.error({ err: String(err) }, "[assinatura] erro ao servir pdf assinado");
    res.status(500).json({ error: "erro_pdf" });
  }
});

// ---------------------------------------------------------------------------
// Webhook do TELEGRAM (livre — registrado antes do guard).
// ---------------------------------------------------------------------------
export const telegramWebhookRouter: IRouter = Router();

telegramWebhookRouter.post("/webhooks/telegram", async (req, res): Promise<void> => {
  try {
    // Defesa 1 — origem. Fail-closed: sem segredo no cofre, ninguém vincula.
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
    const texto: string = typeof msg.text === "string" ? msg.text.trim() : "";
    if (!chatId) {
      res.status(200).json({ ok: true });
      return;
    }

      const chatIdCEO = process.env["PADAXOR_TELEGRAM_CHAT_ID"] || null;

    // ── PASSO 1: verifica se este chatId já está vinculado a algum cliente ───
    const [clienteJaVinculado] = await db
      .select({
        id: clientsTable.id,
        name: clientsTable.name,
        cpf: clientsTable.cpf,
        empresaId: clientsTable.empresaId,
      })
      .from(clientsTable)
      .where(eq(clientsTable.telegramChatId, chatId))
      .limit(1);

    if (clienteJaVinculado) {
      // ── Modo INBOX: cliente vinculado enviou mensagem → delega à lib ────────
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
              const inserted = await db
                .insert(telegramInboxTable)
                .values({
                  empresaId: params.empresaId,
                  clienteId: params.clienteId,
                  chatId: params.chatId,
                  texto: params.texto,
                })
                .returning({ id: telegramInboxTable.id });
              return { id: inserted[0]?.id ?? 0 };
            },
            notificarCEO: chatIdCEO
              ? async (ceoId, cli) => {
                  const cpfDisplay = (cliente.cpf || "00000000000")
                    .replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
                  const repasse =
                    `💬 <b>Mensagem via Telegram</b>\n\n` +
                    `<b>De:</b> ${cliente.name}\n` +
                    `<b>CPF:</b> ${cpfDisplay}\n\n` +
                    `"${texto}"\n\n` +
                    `──────────────────\n` +
                    `Responda em: Cockpit → ${cliente.name.split(" ")[0]}`;
                  void sendTelegram(ceoId, repasse);
                  logger.info({ clienteId: cli.id }, "[telegram] mensagem encaminhada ao CEO");
                }
              : undefined,
          },
        ).catch((err: unknown) =>
          logger.error({ err }, "[telegram] falha ao processar mensagem no inbox"),
        );

        // Best-effort: alerta Slack quando paciente responde após CEO ter enviado mensagem
        void (async () => {
          try {
            const { rows: saidaRows } = await db.execute(sql`
              SELECT id FROM telegram_inbox_messages
              WHERE cliente_id = ${clienteJaVinculado.id}
                AND direcao = 'saida'
                AND criado_at >= NOW() - INTERVAL '48 hours'
              LIMIT 1
            `);
            if ((saidaRows as unknown[]).length > 0) {
              const slackChannel = process.env["PADAXOR_SLACK_CHANNEL_ID"] ?? "C0BLW5S7GQL";
              const primeiroNome = clienteJaVinculado.name.split(" ")[0] || clienteJaVinculado.name;
              const trecho = texto.length > 120 ? texto.slice(0, 120) + "\u2026" : texto;
              await postSlackAlert(
                slackChannel,
                `\uD83D\uDCAC *${primeiroNome} respondeu via Telegram:*\n>${trecho}`,
              );
            }
          } catch (slackErr) {
            logger.warn({ err: String(slackErr) }, "[telegram] falha ao postar resposta no Slack");
          }
        })();
      } // closes if (texto)
      res.status(200).json({ ok: true });
      return;
    } // closes if (clienteJaVinculado)

    // ── PASSO 2: cliente não vinculado — tenta vinculação por prova de posse ─
    const candidatos = new Set<string>();
    const textoLimpo = texto.trim().toUpperCase();
    if (textoLimpo) {
      candidatos.add(textoLimpo);
      for (const tok of textoLimpo.split(/\s+/)) if (tok) candidatos.add(tok);
    }

    // validationPassword NÃO é UNIQUE — colisão = recusa segura
    let alvo: { id: number; name: string } | undefined;
    let ambiguo = false;
    if (candidatos.size > 0) {
      const clientRows = await db
        .select({ id: clientsTable.id, name: clientsTable.name, vp: clientsTable.validationPassword })
        .from(clientsTable);
      const matches = clientRows.filter((r) => r.vp && candidatos.has(r.vp.trim().toUpperCase()));
      if (matches.length === 1) alvo = { id: matches[0].id, name: matches[0].name };
      else if (matches.length > 1) ambiguo = true;
    }

    if (ambiguo) {
      logger.warn("[telegram] vínculo recusado: senha de validação ambígua (colisão)");
    } else if (alvo) {
      await db.execute(
        sql`UPDATE clients SET telegram_chat_id = ${chatId}, telegram_vinculado_em = now() WHERE id = ${alvo.id}`
      );
      logger.info({ clienteId: alvo.id }, "[telegram] chat_id vinculado (prova de posse válida)");

      const primeiroNome = alvo.name.split(" ")[0] || alvo.name;
      void sendTelegram(
        chatId,
        `🎉 <b>Olá, ${primeiroNome}!</b>\n\n` +
        `Seu Telegram está agora vinculado ao <b>Instituto Pádua</b>.\n\n` +
        `A partir de agora você receberá aqui:\n` +
        `• Lembretes de sessões\n` +
        `• Resultados de exames\n` +
        `• Orientações do Dr. Caio\n\n` +
        `Você também pode nos enviar mensagens e a equipe receberá.`,
      );

      if (chatIdCEO) {
        void sendTelegram(
          chatIdCEO,
          `✅ <b>Novo cliente vinculou o Telegram</b>\n\nCliente: ${alvo.name}`,
        );
      }
    } else {
      if (texto) {
        void sendTelegram(
          chatId,
          `👋 Olá!\n\n` +
          `Para ativar a comunicação com o <b>Instituto Pádua</b>, envie a sua <b>senha de validação</b> ` +
          `que foi enviada por e-mail ou WhatsApp.\n\n` +
          `Dúvidas? WhatsApp: (11) 94655-4000`,
        );
      }
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
// Simula o fluxo "paciente vinculado envia mensagem ao bot → CEO recebe repasse".
// Rota protegida por requireCollaborator — nunca exposta ao público.
// ---------------------------------------------------------------------------
assinaturasRouter.post(
  "/telegram/test-inbox",
  requireCollaborator,
  async (req, res): Promise<void> => {
    try {
      const clienteId = Number(req.body?.clienteId);
      const texto: string = typeof req.body?.texto === "string" ? req.body.texto.trim() : "";

      if (!clienteId || clienteId <= 0) {
        res.status(400).json({ ok: false, error: "clienteId_invalido", detalhe: "Informe clienteId numérico > 0." });
        return;
      }
      if (!texto) {
        res.status(400).json({ ok: false, error: "texto_vazio", detalhe: "Informe o campo texto." });
        return;
      }

      const [cliente] = await db
        .select({
          id: clientsTable.id,
          name: clientsTable.name,
          cpf: clientsTable.cpf,
          telegramChatId: clientsTable.telegramChatId,
        })
        .from(clientsTable)
        .where(eq(clientsTable.id, clienteId))
        .limit(1);

      if (!cliente) {
        res.status(404).json({ ok: false, error: "cliente_nao_encontrado", clienteId });
        return;
      }
      if (!cliente.telegramChatId) {
        res.status(422).json({
          ok: false,
          error: "canal_nao_vinculado",
          detalhe: `Cliente "${cliente.name}" não possui telegramChatId vinculado.`,
        });
        return;
      }

      const chatIdCEO = process.env["PADAXOR_TELEGRAM_CHAT_ID"] || null;
      if (!chatIdCEO) {
        res.status(503).json({ ok: false, error: "ceo_chatid_ausente", detalhe: "PADAXOR_TELEGRAM_CHAT_ID não configurado." });
        return;
      }

      const cpfDisplay = (cliente.cpf || "00000000000")
        .replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
      const repasse =
        `💬 <b>Mensagem via Telegram</b>\n\n` +
        `<b>De:</b> ${cliente.name}\n` +
        `<b>CPF:</b> ${cpfDisplay}\n\n` +
        `"${texto}"\n\n` +
        `──────────────────\n` +
        `Responda em: Cockpit → ${cliente.name.split(" ")[0]}`;

      const resultado = await sendTelegram(chatIdCEO, repasse);
      logger.info({ clienteId: cliente.id, mock: resultado.mock }, "[telegram] mensagem encaminhada ao CEO");
      const telegramEntregue = resultado.sent && !resultado.mock;

      // Best-effort: se há mensagem de saída recente (CEO respondeu ao paciente
      // nas últimas 48h), postar no Slack que o paciente respondeu de volta.
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
            const primeiroNome = cliente.name.split(" ")[0] || cliente.name;
            const trecho = texto.length > 120 ? texto.slice(0, 120) + "…" : texto;
            const { postSlackAlert } = await import("../lib/slack-reporter.js");
            await postSlackAlert(
              slackChannel,
              `💬 *${primeiroNome} respondeu via Telegram:*\n>${trecho}`,
            );
          }
        } catch (slackErr) {
          logger.warn({ err: String(slackErr) }, "[telegram] falha ao postar resposta no Slack");
        }
      })();

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
  },
);

// ---------------------------------------------------------------------------
// GET /api/telegram/webhook-status
// ---------------------------------------------------------------------------
assinaturasRouter.get("/telegram/webhook-status", requireCollaborator, async (_req, res): Promise<void> => {
  try {
    const { checkWebhookHealth } = await import("../lib/telegram-webhook-guard.js");
    const result = await checkWebhookHealth();
    if (result.mock) {
      res.status(400).json({ ok: false, error: "token_ausente", descricao: "Token do bot não configurado no cofre." });
      return;
    }
    if (result.fetchError) {
      res.status(503).json({ ok: false, error: result.fetchError, descricao: result.lastErrorMessage ?? "Falha ao consultar Telegram." });
      return;
    }
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// GET /api/cert/metadata — metadados públicos do certificado A1 embarcado
assinaturasRouter.get("/cert/metadata", async (_req, res): Promise<void> => {
  try {
    const { getCertInfo } = await import("../lib/pdf-signer.js");
    const info = getCertInfo();
    res.json({
      titular:  info.subject  ?? null,
      cpf:      info.cpf      ?? null,
      validade: info.validTo  ?? null,
      emissor:  info.issuer   ?? null,
      serial:   info.serial   ?? null,
      tipo:     "A1 ICP-Brasil",
      ok:       true,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default assinaturasRouter;
