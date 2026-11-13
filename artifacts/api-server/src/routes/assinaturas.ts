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
} from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import { requireMessageClinic } from "../middleware/messageClinic";
import { vinculoTelegramAtualUnico } from "../lib/telegram-vinculo-atual";
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
import { randomUUID } from "node:crypto";
import { getSecret } from "../lib/secure-settings";
import { sendTelegram } from "../lib/telegram.js";
import { postSlackAlert } from "../lib/slack-reporter.js";
import {
  processarWebhookInbox,
  type ClienteVinculado,
} from "../lib/telegram-inbox-flow";
import { parseStart, consumirLinkMagico } from "../lib/telegram-magic-link";
import { gravarMensagemEntrada, extrairUpdateId, erroTransitorioDeBanco } from "../lib/telegram-inbox-store";
import { resolverChatAlerta } from "../lib/telegram-config";
import { registrarPendenciaVinculo } from "../lib/telegram-vinculo-pendencia";
import { registrarRepasseDuravel, tentarRepasseAgora } from "../lib/telegram-repasse-worker";
import { atenderMensagemTelegram } from "../lib/atendimento-telegram-store";
import {
  reivindicarUpdate, concluirUpdate, liberarUpdate, botIdDoToken,
} from "../lib/telegram-update-claim";

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
    const msg = err instanceof Error ? err.message : String(err);
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
    const msg = err instanceof Error ? err.message : String(err);
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
    const trava = Boolean(rows[0]?.travaConsentimentoAtiva);
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
      .select({
        id: assinaturaSolicitacoesTable.id,
        titulo: assinaturaSolicitacoesTable.titulo,
        escopo: assinaturaSolicitacoesTable.escopo,
        status: assinaturaSolicitacoesTable.status,
        templateId: assinaturaSolicitacoesTable.templateId,
        enviadoEm: assinaturaSolicitacoesTable.enviadoEm,
        criadoEm: assinaturaSolicitacoesTable.criadoEm,
      })
      .from(assinaturaSolicitacoesTable)
      .where(
        and(
          eq(assinaturaSolicitacoesTable.pacienteId, pid),
          like(assinaturaSolicitacoesTable.escopo, "RAS_FAP_ENTREGA%"),
        ),
      )
      .orderBy(desc(assinaturaSolicitacoesTable.criadoEm));
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
      tipoDoc: sol.tipoDoc,
      titulo: sol.titulo ?? undefined,
      dados: dadosOriginais,
      incluirMedico,
      escopo: sol.escopo ?? undefined,
      canais: (sol.canaisDistribuir ?? undefined) as string[] | undefined,
    } as EnviarAssinaturaInput);
    res.status(200).json(resultado);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code =
      msg.startsWith("paciente_nao_encontrado") ? 404 :
      msg.startsWith("template_nao_encontrado") ? 404 :
      msg.startsWith("paciente_sem_canal") ? 400 : 500;
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
    let segredoEsperado: string | null;
    try {
      segredoEsperado = await getSecret("telegram.webhookSecret");
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? err.code : undefined;
      logger.error({
        secretKey: "telegram.webhookSecret",
        errorType: err instanceof Error ? err.constructor.name : typeof err,
        errorCode: typeof code === "string" && /^[A-Z0-9_]{2,40}$/.test(code) ? code : undefined,
      }, "[telegram] falha técnica ao consultar cofre; update não processado (500 para o Telegram reentregar)");
      // Falha técnica passageira: 200 descartaria para sempre um update legítimo. Telegram reentrega.
      res.status(500).json({ ok: false });
      return;
    }
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
      // Log mínimo: só o TIPO do evento (nunca texto, nome, token ou identificador de pessoa).
      const tipo = Object.keys(update).find((k) => k !== "update_id") ?? "vazio";
      logger.info({ tipo }, "[telegram] update ignorado: sem chat de mensagem (nenhum efeito)");
      res.status(200).json({ ok: true });
      return;
    }

    // ── Deduplicação de TODOS os fluxos (mensagem, /start, link mágico, senha, chat sem vínculo).
    // Chave por identidade do bot + update_id. Ver lib/telegram-update-claim.ts.
    const updateIdEntrada = extrairUpdateId(update.update_id);
    if (updateIdEntrada === null) {
      logger.warn("[telegram] update sem update_id válido: processado sem deduplicação");
    } else {
      let tokenDoBot: string | null = process.env["TELEGRAM_BOT_TOKEN"] || null;
      if (!tokenDoBot) {
        try { tokenDoBot = await getSecret("telegram.botToken"); } catch { tokenDoBot = null; }
      }
      const botId = botIdDoToken(tokenDoBot);
      const dono = randomUUID();
      let reivindicou = false;
      try {
        const claim = await reivindicarUpdate(db, botId, updateIdEntrada, dono);
        if (claim === "ja_concluido") {
          logger.info("[telegram] entrega repetida de update já concluído ignorada (nenhum efeito repetido)");
          res.status(200).json({ ok: true });
          return;
        }
        if (claim === "em_andamento") {
          // O primeiro processamento ainda pode falhar: 200 aqui perderia a mensagem.
          logger.info("[telegram] update ainda em processamento; nova tentativa solicitada (500)");
          res.status(500).json({ ok: false });
          return;
        }
        reivindicou = true;
      } catch (err) {
        if (erroTransitorioDeBanco(err)) throw err;
        // Decisão documentada (specs/telegram-repasse-outbox.md): erro NÃO transitório na reivindicação
        // (ex.: tabela ausente) não derruba o recebimento — a mensagem é processada e a gravação do inbox
        // ainda deduplica por (chat_id, update_id). Registrado como ERROR para alerta.
        logger.error(
          { errorType: err instanceof Error ? err.constructor.name : typeof err },
          "[telegram] reivindicação indisponível; processando sem a camada de deduplicação (a gravação do inbox ainda deduplica)",
        );
      }
      if (reivindicou) {
        // Fecha o ciclo ANTES de responder ao Telegram (o ACK só sai depois do fechamento durável):
        // sucesso conclui; 5xx libera para a reentrega. Falha ao fechar não bloqueia a resposta (log).
        const jsonOriginal = res.json.bind(res);
        let fechado = false;
        res.json = ((corpo?: unknown) => {
          if (fechado) return jsonOriginal(corpo);
          fechado = true;
          const fechar = res.statusCode >= 500 ? liberarUpdate : concluirUpdate;
          void fechar(db, botId, updateIdEntrada, dono)
            .catch((e: unknown) =>
              logger.warn({ errorType: e instanceof Error ? e.constructor.name : typeof e }, "[telegram] falha ao fechar a reivindicação do update"),
            )
            .finally(() => { jsonOriginal(corpo); });
          return res;
        }) as typeof res.json;
      }
    }

    // Chat de alerta: fonte única (cofre > ambiente, validado como numérico). Nunca troca de chat.
    const alertaCfg = await resolverChatAlerta();
    const chatIdCEO = alertaCfg.chatId;
    if (!chatIdCEO) {
      logger.error({ motivo: alertaCfg.motivo }, "[telegram] chat de alerta indisponível: repasse não será feito (mensagem continua salva)");
    }
    const { isStart, payload: tokenMagico } = parseStart(texto);

    // ── PASSO 1: verifica se este chatId já está vinculado a algum cliente ───
    const vinculados = await db
      .select({
        id: clientsTable.id,
        name: clientsTable.name,
        cpf: clientsTable.cpf,
        empresaId: clientsTable.empresaId,
      })
      .from(clientsTable)
      .where(eq(clientsTable.telegramChatId, chatId))
      .limit(5);

    if (vinculados.length > 1) {
      // Vínculo ambíguo: o mesmo chat em mais de um cliente. NÃO escolhe um deles (nunca grava no
      // prontuário errado): guarda a mensagem numa pendência verificável e avisa o chat de alerta.
      const nova = await registrarPendenciaVinculo(db, {
        chatId, updateId: updateIdEntrada, candidatos: vinculados.map((v) => v.id), texto,
      });
      logger.error({ candidatos: vinculados.length, nova }, "[telegram] vínculo ambíguo: mensagem guardada em pendência (nenhum cliente escolhido)");
      if (nova && chatIdCEO && chatIdCEO !== chatId) {
        void sendTelegram(
          chatIdCEO,
          "Atenção: um chat do Telegram está ligado a mais de um cliente. A mensagem foi guardada em pendência, sem escolher nenhum deles. Confira em Radar / vínculos do Telegram.",
        );
      }
      res.status(200).json({ ok: true });
      return;
    }
    const clienteJaVinculado = vinculados[0];

    if (clienteJaVinculado) {
      if (isStart) {
        void sendTelegram(chatId, "Seu Telegram já está vinculado. Pode nos escrever por aqui.");
        res.status(200).json({ ok: true });
        return;
      }
      // ── Modo INBOX: cliente vinculado enviou mensagem → delega à lib ────────
      if (texto) {
        const cliente: ClienteVinculado = {
          id: clienteJaVinculado.id,
          name: clienteJaVinculado.name,
          empresaId: clienteJaVinculado.empresaId ?? 0,
          cpf: clienteJaVinculado.cpf,
        };

        let resultado: Awaited<ReturnType<typeof processarWebhookInbox>> | null = null;
        const gravada: { id: number | null } = { id: null };
        try {
          resultado = await processarWebhookInbox(
            { chatId, texto, chatIdCEO, updateId: extrairUpdateId(update.update_id) },
            {
              findClienteByChatId: async () => cliente,
              insertMensagem: async (params) => {
                const g = await gravarMensagemEntrada(db, params);
                gravada.id = g.id;
                return g;
              },
            },
          );
        } catch (err) {
          // Sem persistência não há confirmação nem envio direto. Mesmo falha estrutural
          // exige correção e reentrega: 200 descartaria a mensagem definitivamente.
          const code = (err as { code?: unknown; cause?: { code?: unknown } } | null);
          logger.error(
            { errorType: err instanceof Error ? err.constructor.name : typeof err, errorCode: String(code?.code ?? code?.cause?.code ?? "") || undefined },
            "[telegram] falha ao gravar mensagem no inbox; reentrega necessária, sem envio direto",
          );
          res.status(500).json({ ok: false });
          return;
        }
        // Repasse ao chat de alerta: registrado no outbox ANTES do 200 (idempotente). Vale também para a
        // reentrega de mensagem já salva, para recuperar um registro que tenha ficado pela metade.
        if ((resultado?.kind === "gravado" || resultado?.kind === "duplicado") && chatIdCEO && resultado.mensagemId > 0 && chatIdCEO !== chatId) {
          let repasseId: number | null = null;
          try {
            repasseId = await registrarRepasseDuravel({ inboxMessageId: resultado.mensagemId, chatIdDestino: chatIdCEO });
          } catch (err) {
            // A mensagem permanece no Cockpit, mas o repasse ainda não é durável.
            // Não contornar validação/deduplicação com envio direto; 500 permite
            // refazer o registro após a correção, sem duplicar a mensagem.
            logger.error(
              { errorType: err instanceof Error ? err.constructor.name : typeof err },
              "[telegram] outbox indisponível: sem envio direto; reentrega necessária",
            );
            res.status(500).json({ ok: false });
            return;
          }
          if (repasseId !== null) void tentarRepasseAgora(repasseId);
        }
        // Atendimento por IA (desligado por padrão; ver lib/atendimento-telegram.ts). Só mensagem NOVA e salva;
        // roda depois do repasse e nunca atrasa nem derruba a resposta ao Telegram.
        if (resultado?.kind === "gravado" && resultado.mensagemId > 0 && cliente.empresaId > 0) {
          void atenderMensagemTelegram({
            inboxMessageId: resultado.mensagemId, empresaId: cliente.empresaId, clienteId: cliente.id,
            clienteNome: cliente.name, chatId, texto,
          });
        }
        if (resultado?.kind === "duplicado") {
          logger.info({ clienteId: cliente.id }, "[telegram] entrega duplicada ignorada (update_id já gravado)");
          res.status(200).json({ ok: true });
          return;
        }
        if (!resultado) {
          res.status(200).json({ ok: true });
          return;
        }
        // Best-effort: alerta Slack quando paciente responde após CEO ter enviado mensagem
        void (async () => {
          try {
            const { rows: saidaRows } = await db.execute(sql`
              SELECT id FROM telegram_inbox_messages
              WHERE cliente_id = ${cliente.id}
                AND direcao = 'saida'
                AND recebida_em >= NOW() - INTERVAL '48 hours'
                AND empresa_id = ${cliente.empresaId}
              LIMIT 1
            `);
            if (saidaRows.length > 0) {
              const slackChannel = process.env["PADAXOR_SLACK_CHANNEL_ID"] ?? "C0BLW5S7GQL";
              const primeiroNome = cliente.name.split(" ")[0] || cliente.name;
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

    // Preserva o caminho de ativação em um toque e suas travas atômicas.
    if (tokenMagico) {
      const consumo = await consumirLinkMagico(tokenMagico, chatId);
      if (consumo.status === "vinculado") {
        void sendTelegram(chatId, `Olá, ${consumo.nome.split(" ")[0]}! Seu Telegram foi vinculado ao Instituto Pádua.`);
        if (chatIdCEO) void sendTelegram(chatIdCEO, `Novo cliente vinculou o Telegram: ${consumo.nome}`);
      } else {
        void sendTelegram(chatId, "Não foi possível ativar este vínculo. Solicite um novo link à equipe ou envie sua senha de validação.");
        if (consumo.status === "colisao" && chatIdCEO) {
          void sendTelegram(chatIdCEO, "Vínculo recusado: este Telegram já pertence a outro cadastro. Nada foi alterado.");
        }
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
    if (erroTransitorioDeBanco(err)) {
      const code = err as { code?: unknown; cause?: { code?: unknown } };
      req.log.error(
        { errorCode: String(code.code ?? code.cause?.code ?? "") || undefined },
        "[telegram] falha técnica passageira no webhook — reentrega solicitada ao Telegram (500)",
      );
      res.status(500).json({ ok: false });
      return;
    }
    req.log.error({ errorType: err instanceof Error ? err.constructor.name : typeof err }, "[telegram] erro no webhook");
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
  requireMessageClinic,
  async (req, res): Promise<void> => {
    try {
      const clienteId = Number(req.body?.clienteId);
      const texto: string = typeof req.body?.texto === "string" ? req.body.texto.trim() : "";

      if (!Number.isSafeInteger(clienteId) || clienteId <= 0) {
        res.status(400).json({ ok: false, error: "clienteId_invalido", detalhe: "Informe clienteId numérico > 0." });
        return;
      }
      if (!texto) {
        res.status(400).json({ ok: false, error: "texto_vazio", detalhe: "Informe o campo texto." });
        return;
      }
      if (texto.length > 4096) {
        res.status(400).json({ ok: false, error: "texto_muito_longo" });
        return;
      }
      const empresaId = req.messageEmpresaId!;

      const [cliente] = await db
        .select({
          id: clientsTable.id,
          name: clientsTable.name,
          cpf: clientsTable.cpf,
          telegramChatId: clientsTable.telegramChatId,
        })
        .from(clientsTable)
        .where(and(eq(clientsTable.id, clienteId), eq(clientsTable.empresaId, empresaId)))
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
      if (!await vinculoTelegramAtualUnico(db, {
        clienteId, empresaId, chatId: cliente.telegramChatId,
      })) {
        res.status(409).json({ ok: false, error: "vinculo_alterado_ou_ambiguo" });
        return;
      }

      const alertaCfg = await resolverChatAlerta();
      const chatIdCEO = alertaCfg.chatId;
      if (!chatIdCEO) {
        res.status(503).json({ ok: false, error: "ceo_chatid_ausente", detalhe: `Chat de alerta indisponível (${alertaCfg.motivo}).` });
        return;
      }

      const mensagem = await gravarMensagemEntrada(db, {
        empresaId, clienteId, chatId: cliente.telegramChatId, texto,
      });
      const repasseId = await registrarRepasseDuravel({
        inboxMessageId: mensagem.id, chatIdDestino: chatIdCEO,
      });
      // O worker existente é o único consumidor desta ferramenta de teste.
      // Retornar 202 não comprova que a chamada ao Telegram já aconteceu.
      res.status(202).json({
        ok: true, enfileirado: true, telegramEntregue: false, repasseId,
        descricao: "Repasse registrado na fila; aceite do Telegram ainda não comprovado.",
      });
    } catch (err) {
      logger.error({ errorType: err instanceof Error ? err.constructor.name : typeof err }, "[telegram] erro no test-inbox");
      res.status(500).json({ ok: false, error: "erro_interno" });
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
