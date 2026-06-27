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
import type { ProvedorCodigo } from "../lib/assinatura/types";

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
    const itens = await listarTimeline();
    res.status(200).json({ itens });
  } catch (err) {
    req.log.error({ err: String(err) }, "[assinatura] erro na timeline");
    res.status(500).json({ error: "erro_timeline" });
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

export default assinaturasRouter;
