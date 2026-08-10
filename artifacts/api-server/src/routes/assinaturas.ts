/**
 * Rotas do motor de Assinatura Remota (Paxter).
 *
 * Dois routers exportados:
 *  - `assinaturaWebhookRouter` (default-livre): recebe o callback do ZapSign.
 *    Registrado ANTES do collaboratorGuard (provedor externo, sem sessão).
 *    Autenticidade via header secreto próprio (x-paxter-secret); inválido = 401.
 *  - `assinaturasRouter` (protegido): rotas internas atrás de requireCollaborator.
 */

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, clientsTable, assinaturaTogglesAdminTable } from "@workspace/db";
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

// ---------------------------------------------------------------------------
// Webhook (livre — registrado antes do guard).
// ---------------------------------------------------------------------------
export const assinaturaWebhookRouter: IRouter = Router();

assinaturaWebhookRouter.post("/webhooks/assinatura/:provedor", async (req, res): Promise<void> => {
  // Escopo da Onda F: somente ZapSign está cabeado e testado. Não prometemos
  // Clicksign aqui (a validação por raw body reconstruído seria incorreta).
  const provedor = (req.params.provedor || "zapsign") as ProvedorCodigo;
  if (provedor !== "zapsign") {
    res.status(404).json({ error: "provedor_desconhecido" });
    return;
  }
  try {
    // O app tem JSON parser global; ZapSign não usa HMAC do corpo (apenas header
    // secreto), então reserializar o JSON é seguro para a validação.
    const rawBody = Buffer.from(JSON.stringify(req.body ?? {}));
    const resultado = await receberWebhook(provedor, rawBody, req.headers);
    if (resultado.unauthorized) {
      res.status(401).json({ error: "assinatura_invalida" });
      return;
    }
    if (resultado.transient) {
      // Falha recuperável (ex.: upload do PDF). Não dá ack para o ZapSign reentregar.
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
    const msg = (err as Error).message;
    const code =
      msg.startsWith("paciente_nao_encontrado") ? 404 :
      msg.startsWith("template_nao_encontrado") ? 404 :
      msg.startsWith("paciente_sem_canal") ? 400 :
      msg.startsWith("conteudo_ausente") ? 400 : 500;
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
    const resultado = await enviarAssinatura({ ...body, tipoDoc: "TCLE" });
    res.status(200).json(resultado);
  } catch (err) {
    const msg = (err as Error).message;
    const code =
      msg.startsWith("paciente_nao_encontrado") ? 404 :
      msg.startsWith("template_nao_encontrado") ? 404 :
      msg.startsWith("paciente_sem_canal") ? 400 :
      msg.startsWith("conteudo_ausente") ? 400 : 500;
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

// Ponto de aplicação da TRAVA aditiva: um ato (ex.: lançar protocolo) chama
// este endpoint antes de prosseguir. 409 só quando o toggle está LIGADO e não
// há consentimento assinado. Desligado: sempre 200 (nada quebra).
assinaturasRouter.post("/assinaturas/consentimento/assert", requireCollaborator, async (req, res): Promise<void> => {
  try {
    const pid = Number(req.body?.pacienteId);
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
  const rows = await db.select().from(assinaturaTogglesAdminTable).where(eq(assinaturaTogglesAdminTable.id, 1)).limit(1);
  const trava = Boolean(rows[0]?.travaConsentimentoAtiva);
  res.status(200).json({ travaConsentimentoAtiva: trava });
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
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("codigo_ausente") || msg.startsWith("conteudo_ausente")) {
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
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("clausula_nao_encontrada")) {
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
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("codigo_ausente") || msg.startsWith("conteudo_ausente")) {
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
//
// Duas defesas obrigatórias (endpoint público recebe canal de notificação clínica):
//  1) ORIGEM: validamos o cabeçalho `X-Telegram-Bot-Api-Secret-Token` contra o
//     segredo `telegram.webhookSecret` do cofre (definido no setWebhook). Sem
//     segredo configurado OU divergente => fail-closed (ignora, não grava nada).
//     Isso impede spoofing por requisição HTTP direta.
//  2) PROVA DE POSSE: só vinculamos o chat_id quando a mensagem traz a SENHA DE
//     VALIDAÇÃO permanente do cliente (clients.validationPassword) — algo que só
//     o próprio cliente conhece. CPF/telefone "crus" NÃO bastam (eram sequestro:
//     qualquer um que soubesse o CPF assumiria o canal do outro).
//
// NUNCA logamos o segredo nem o token (este router nem usa o token do bot).
// Telegram exige HTTP 200 sempre (senão reentrega em loop) — respondemos 200
// inclusive quando ignoramos, sem revelar o motivo ao chamador.
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
    if (!chatId) {
      res.status(200).json({ ok: true });
      return;
    }

    const texto: string = typeof msg.text === "string" ? msg.text : "";
    const chatIdCEO = process.env["PADAXOR_TELEGRAM_CHAT_ID"] || null;

    // ── PASSO 1: verifica se este chatId já está vinculado a algum cliente ───
    const [clienteJaVinculado] = await db
      .select({ id: clientsTable.id, name: clientsTable.name, cpf: clientsTable.cpf })
      .from(clientsTable)
      .where(eq(clientsTable.telegramChatId, chatId))
      .limit(1);

    if (clienteJaVinculado) {
      // ── Modo INBOX: cliente vinculado enviou mensagem → encaminha ao CEO ──
      if (texto && chatIdCEO) {
        const cpfDisplay = (clienteJaVinculado.cpf || "00000000000")
          .replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
        const repasse =
          `💬 <b>Mensagem via Telegram</b>\n\n` +
          `<b>De:</b> ${clienteJaVinculado.name}\n` +
          `<b>CPF:</b> ${cpfDisplay}\n\n` +
          `"${texto}"\n\n` +
          `──────────────────\n` +
          `Responda em: Cockpit → ${clienteJaVinculado.name.split(" ")[0]}`;
        void sendTelegram(chatIdCEO, repasse);
        logger.info({ clienteId: clienteJaVinculado.id }, "[telegram] mensagem encaminhada ao CEO");
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

    // validationPassword NÃO é UNIQUE — colisão = recusa segura
    let alvo: { id: number; name: string } | undefined;
    let ambiguo = false;
    if (candidatos.size > 0) {
      const rows = await db
        .select({ id: clientsTable.id, name: clientsTable.name, vp: clientsTable.validationPassword })
        .from(clientsTable);
      const matches = rows.filter((r) => r.vp && candidatos.has(r.vp.trim().toUpperCase()));
      if (matches.length === 1) alvo = { id: matches[0].id, name: matches[0].name };
      else if (matches.length > 1) ambiguo = true;
    }

    if (ambiguo) {
      logger.warn("[telegram] vínculo recusado: senha de validação ambígua (colisão)");
    } else if (alvo) {
      // ── Vinculação confirmada ─────────────────────────────────────────────
      await db.update(clientsTable).set({ telegramChatId: chatId }).where(eq(clientsTable.id, alvo.id));
      logger.info({ clienteId: alvo.id }, "[telegram] chat_id vinculado (prova de posse válida)");

      // Boas-vindas ao cliente
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

      // Notifica CEO sobre nova vinculação
      if (chatIdCEO) {
        void sendTelegram(
          chatIdCEO,
          `✅ <b>Novo cliente vinculou o Telegram</b>\n\nCliente: ${alvo.name}`,
        );
      }
    } else {
      // ── Mensagem sem prova de posse válida — envia instrução ao cliente ──
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
//
// Simula o fluxo "paciente vinculado envia mensagem ao bot → CEO recebe repasse".
// Rota protegida por requireCollaborator — nunca exposta ao público.
//
// Body: { clienteId: number, texto: string }
//
// O que valida:
//  1) Cliente existe e tem telegramChatId vinculado.
//  2) PADAXOR_TELEGRAM_CHAT_ID configurado (chatId do CEO).
//  3) sendTelegram() entrega o repasse formatado ao CEO.
//  4) Log `[telegram] mensagem encaminhada ao CEO` aparece no servidor.
//
// Uso via curl (substitua TOKEN pelo token de colaborador):
//   curl -s -X POST "$API/telegram/test-inbox" \
//        -H "Authorization: Bearer TOKEN" \
//        -H "Content-Type: application/json" \
//        -d '{"clienteId":1,"texto":"Oi, doutora, tenho uma dúvida!"}'
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
        res.status(400).json({ ok: false, error: "texto_vazio", detalhe: "Informe o campo texto com a mensagem do paciente." });
        return;
      }

      // 1) Buscar cliente e verificar vínculo Telegram.
      const [cliente] = await db
        .select({ id: clientsTable.id, name: clientsTable.name, cpf: clientsTable.cpf, telegramChatId: clientsTable.telegramChatId })
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
          detalhe: `Cliente "${cliente.name}" (id=${clienteId}) não possui telegramChatId vinculado. Vincule primeiro pelo bot.`,
        });
        return;
      }

      // 2) Verificar chatId do CEO.
      const chatIdCEO = process.env["PADAXOR_TELEGRAM_CHAT_ID"] || null;
      if (!chatIdCEO) {
        res.status(503).json({
          ok: false,
          error: "ceo_chatid_ausente",
          detalhe: "PADAXOR_TELEGRAM_CHAT_ID não configurado — CEO não pode receber repasse.",
        });
        return;
      }

      // 3) Formatar e enviar repasse (lógica idêntica ao webhook /webhooks/telegram).
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

      // 4) Log obrigatório — mesmo que o webhook real usa.
      logger.info({ clienteId: cliente.id, mock: resultado.mock }, "[telegram] mensagem encaminhada ao CEO");

      res.json({
        ok: resultado.sent,
        mock: resultado.mock,
        erro: resultado.error ?? null,
        cliente: { id: cliente.id, nome: cliente.name, cpfDisplay, telegramChatId: cliente.telegramChatId },
        ceoChatId: `${chatIdCEO.slice(0, 3)}***`,   // mascarado — nunca expõe o valor completo
        mensagemEnviada: resultado.sent,
        descricao: resultado.sent
          ? resultado.mock
            ? "MOCK: token do bot ausente no cofre — repasse registrado em log sem chamada real ao Telegram."
            : "Repasse enviado ao CEO com sucesso. Confira o Telegram do Dr. Caio."
          : `Falha ao enviar: ${resultado.error}`,
      });
    } catch (err) {
      req.log.error({ err: String(err) }, "[telegram] erro no test-inbox");
      res.status(500).json({ ok: false, error: "erro_interno", detalhe: String(err) });
    }
  },
);

// GET /api/cert/metadata — metadados públicos do certificado A1 embarcado
// Retorna: titular, CPF, validade, tipo, emissor — nunca expõe chave privada.
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
