import { Router, type IRouter } from "express";
import { requireCollaborator } from "./collaborator.js";
import { requirePlatformOwner } from "../middleware/tenantContext";
import {
  auditarTodas, lerExtratoLocal, lerLog, reconciliarCobranca, varrerPendentes, localizarCobranca,
} from "../lib/asaas-conciliacao.js";

// Conciliacao Asaas por LEITURA. Somente proprietario autenticado: a conta Asaas e unica da plataforma,
// entao nenhuma clinica enxerga ou aplica nada aqui. Nenhuma rota cria ou altera cobranca no Asaas.
const router: IRouter = Router();
const guard = [requireCollaborator, requirePlatformOwner];
const CHARGE_ID = /^pay_[a-z0-9]{6,40}$/;

router.get("/asaas/conciliacao/extrato", ...guard, async (_req, res): Promise<void> => {
  try { res.json(await lerExtratoLocal()); }
  catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : "Falha ao ler o extrato local." }); }
});

router.get("/asaas/conciliacao/log", ...guard, async (req, res): Promise<void> => {
  const id = typeof req.query.chargeId === "string" ? req.query.chargeId : undefined;
  if (id !== undefined && !CHARGE_ID.test(id)) { res.status(400).json({ error: "chargeId invalido" }); return; }
  res.json({ itens: await lerLog(id) });
});

// Auditoria: consulta TODAS as cobrancas (local e Asaas) e atualiza o retrato financeiro. Nao altera status algum.
router.post("/asaas/conciliacao/auditar", ...guard, async (_req, res): Promise<void> => {
  try {
    const a = await auditarTodas();
    const porCausa: Record<string, number> = {};
    for (const r of a.resultados) porCausa[r.causa] = (porCausa[r.causa] ?? 0) + 1;
    res.json({ consultadas: a.resultados.length, falhas: a.falhas, porCausa, ...(await lerExtratoLocal()) });
  } catch (e) { res.status(502).json({ error: e instanceof Error ? e.message : "Falha ao consultar o Asaas." }); }
});

// "Conferir agora": mesma varredura do job automatico (teste em aberto + pagamentos apos a data de corte).
router.post("/asaas/conciliacao/varrer", ...guard, async (_req, res): Promise<void> => {
  try { res.json({ ...(await varrerPendentes()), ...(await lerExtratoLocal()) }); }
  catch (e) { res.status(502).json({ error: e instanceof Error ? e.message : "Falha ao conferir." }); }
});

// Acao explicita por ID (caso antigo). Exige confirmacao, consulta o Asaas e so aplica com prova completa.
router.post("/asaas/conciliacao/cobranca/:chargeId/aplicar", ...guard, async (req, res): Promise<void> => {
  const chargeId = String(req.params.chargeId ?? "");
  if (!CHARGE_ID.test(chargeId)) { res.status(400).json({ error: "chargeId invalido" }); return; }
  if (req.body?.confirmo !== true) { res.status(400).json({ error: "Confirmacao explicita obrigatoria." }); return; }
  const local = await localizarCobranca(chargeId);
  if (!local) { res.status(404).json({ error: "Cobranca sem registro no sistema: nada a aplicar." }); return; }
  if (local.tabela === "concierge") { res.status(409).json({ error: "Pedido Concierge tem fluxo proprio de finalizacao; conciliacao nao o altera." }); return; }
  try {
    const ator = String((req as any).collaborator?.name ?? (req as any).tenantContext?.professionalId ?? "proprietario");
    res.json(await reconciliarCobranca(chargeId, { origem: "manual", ator, aplicar: true }));
  } catch (e) { res.status(502).json({ error: e instanceof Error ? e.message : "Falha ao consultar o Asaas." }); }
});

export default router;
