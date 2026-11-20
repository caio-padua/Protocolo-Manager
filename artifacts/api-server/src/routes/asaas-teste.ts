import { Router, type IRouter } from "express";
import { requireCollaborator } from "./collaborator.js";
import { requirePlatformOwner } from "../middleware/tenantContext";
import {
  validarEntrada, criarCobrancaTeste, enviarLinkCobrancaTeste, enviarTelaPagamentoTeste, listarTeste, resumoTeste, sincronizarTeste, TesteRecusado,
} from "../lib/asaas-teste-cobrancas.js";
import { diagnosticarWebhookAsaas } from "../lib/asaas-webhook-diagnostico.js";

// Cobrancas REAIS de teste (centavos) — somente proprietario autenticado; travas no servidor.
const router: IRouter = Router();
const guard = [requireCollaborator, requirePlatformOwner];

router.get("/asaas/teste-cobrancas", ...guard, async (_req, res): Promise<void> => {
  res.json({ resumo: await resumoTeste(), itens: await listarTeste() });
});

router.post("/asaas/teste-cobrancas", ...guard, async (req, res): Promise<void> => {
  try {
    const entrada = validarEntrada(req.body);
    const prof = (req as any).collaborator?.name ?? (req as any).tenantContext?.professionalId ?? "proprietario";
    const out = await criarCobrancaTeste(entrada, String(prof));
    req.log.info({ id: out.id, centavos: out.valorCentavos }, "Cobranca de teste criada");
    res.status(201).json({ ...out, resumo: await resumoTeste() });
  } catch (e) {
    if (e instanceof TesteRecusado) { res.status(e.codigo).json({ error: e.message }); return; }
    req.log.error({ err: String(e) }, "Falha cobranca de teste");
    res.status(500).json({ error: "Erro interno ao criar cobranca de teste." });
  }
});

router.post("/asaas/teste-cobrancas/:id/enviar-link", ...guard, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "id invalido" }); return; }
    res.json({ ...(await enviarLinkCobrancaTeste(id, { somenteTelegram: req.body?.somenteTelegram === true })), itens: await listarTeste() });
  } catch (e) {
    if (e instanceof TesteRecusado) { res.status(e.codigo).json({ error: e.message }); return; }
    req.log.error({ err: String(e) }, "Falha ao enviar link de cobranca de teste");
    res.status(500).json({ error: "Erro interno ao enviar o link." });
  }
});

router.post("/asaas/teste-cobrancas/:id/enviar-tela", ...guard, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "id invalido" }); return; }
    const out = await enviarTelaPagamentoTeste(id);
    res.json({ telegram: out.telegram, url: out.url });
  } catch (e) {
    if (e instanceof TesteRecusado) { res.status(e.codigo).json({ error: e.message }); return; }
    req.log.error({ err: String(e) }, "Falha ao enviar tela de pagamento");
    res.status(500).json({ error: "Erro interno ao enviar a tela de pagamento." });
  }
});

router.post("/asaas/teste-cobrancas/sincronizar", ...guard, async (_req, res): Promise<void> => {
  try {
    res.json({ ...(await sincronizarTeste()), resumo: await resumoTeste(), itens: await listarTeste() });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : "Falha ao sincronizar." });
  }
});

// Diagnostico SOMENTE LEITURA do webhook de producao (nada e criado, editado ou reativado).
router.get("/asaas/webhook-diagnostico", ...guard, async (_req, res): Promise<void> => {
  try { res.json(await diagnosticarWebhookAsaas()); }
  catch (e) { res.status(502).json({ error: e instanceof Error ? e.message : "Falha ao consultar o Asaas." }); }
});

export default router;
