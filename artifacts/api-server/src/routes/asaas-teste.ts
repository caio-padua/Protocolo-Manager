import { Router, type IRouter } from "express";
import { requireCollaborator } from "./collaborator.js";
import { requirePlatformOwner } from "../middleware/tenantContext";
import {
  validarEntrada, criarCobrancaTeste, listarTeste, resumoTeste, sincronizarTeste, TesteRecusado,
} from "../lib/asaas-teste-cobrancas.js";

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

router.post("/asaas/teste-cobrancas/sincronizar", ...guard, async (_req, res): Promise<void> => {
  try {
    res.json({ ...(await sincronizarTeste()), resumo: await resumoTeste(), itens: await listarTeste() });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : "Falha ao sincronizar." });
  }
});

export default router;
