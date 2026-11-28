// Pedidos de segunda opinião de unidade (OpenAI, pontual e auditada). Clínica e papel vêm do servidor
// (req.tenantContext), nunca do corpo. Só o proprietário da plataforma aprova e executa. Não toca no
// interruptor global exames.llmOpenaiAtivo.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "@workspace/db";
import { requireCollaborator } from "./collaborator";
import { aprovarPedido, executarRevisao, expirarVencidos, rejeitarPedido, LIMITE_PADRAO_DIARIO, TETO_PADRAO_POR_PEDIDO_USD, type Ator } from "../lib/exam-units/pedido-revisao";
import { CUSTO_ESTIMADO_POR_CONSULTA_USD, chaveOpenAIPresente } from "../lib/exam-units/revisao-openai";

import { moduleGuard } from "../middleware/moduleGuard";
const router = Router();

function atorDaSessao(req: Request, res: Response): Ator | null {
  const t = req.tenantContext;
  if (!t?.authenticated || !t.professionalId) { res.status(401).json({ error: "Sessão de colaborador necessária." }); return null; }
  return { professionalId: t.professionalId, empresaId: t.empresaId, isPlatformOwner: t.isPlatformOwner };
}
const idDe = (req: Request) => { const n = Number(req.params.id); return Number.isSafeInteger(n) && n > 0 ? n : null; };
const falha = (res: Response, r: { code: string; http: number }) => res.status(r.http).json({ error: r.code });

router.get("/exames-lab/unidades/pedidos", requireCollaborator, moduleGuard("exames_lab"), async (req, res) => {
  const ator = atorDaSessao(req, res); if (!ator) return;
  try {
    await expirarVencidos();
    const rows = (await pool.query(
      `SELECT id, empresa_id, scope, analyte_code, unit_origin_raw, unit_target, unit_class, ai_eligible, status, occurrences,
              cost_est_usd, cost_cap_usd, cost_real_usd, expires_at, verdict, error_code, requested_at
         FROM exam_unit_review_request
        WHERE ($1::boolean OR empresa_id = $2) ORDER BY (status='pending') DESC, occurrences DESC, id LIMIT 200`,
      [ator.isPlatformOwner, ator.empresaId])).rows;
    const flag = (await pool.query(`SELECT value FROM app_settings WHERE key='exames.llmOpenaiAtivo'`)).rows[0]?.value;
    res.json({
      pedidos: rows,
      podeAprovar: ator.isPlatformOwner,
      custoEstimadoPorConsultaUsd: CUSTO_ESTIMADO_POR_CONSULTA_USD,
      tetoPadraoPorPedidoUsd: TETO_PADRAO_POR_PEDIDO_USD,
      limiteDiario: LIMITE_PADRAO_DIARIO,
      chaveOpenAIConfigurada: chaveOpenAIPresente(),
      interruptorGlobalOpenAI: flag === "true",
      avisoCusto: "Valores são estimativas; o custo real vem do uso devolvido pelo provedor.",
    });
  } catch (e) { req.log?.error({ err: e }, "GET unidades/pedidos falhou"); res.status(500).json({ error: "Falha ao listar pedidos de unidade" }); }
});

const aprovarSchema = z.object({ tetoUsd: z.number().positive().max(1).optional(), ttlMin: z.number().int().min(1).max(240).optional(), reconheceRiscoDuplicidade: z.boolean().optional() }).strict();

router.post("/exames-lab/unidades/pedidos/:id/aprovar", requireCollaborator, moduleGuard("exames_lab"), async (req, res) => {
  const ator = atorDaSessao(req, res); if (!ator) return;
  const id = idDe(req); if (!id) return res.status(400).json({ error: "id inválido" });
  const body = aprovarSchema.safeParse(req.body ?? {});
  if (!body.success) return res.status(400).json({ error: "Dados inválidos" });
  try { const r = await aprovarPedido(id, ator, body.data); return r.ok ? res.json(r) : falha(res, r); }
  catch (e) { req.log?.error({ err: e }, "aprovar pedido falhou"); return res.status(500).json({ error: "Falha ao aprovar" }); }
});

router.post("/exames-lab/unidades/pedidos/:id/rejeitar", requireCollaborator, moduleGuard("exames_lab"), async (req, res) => {
  const ator = atorDaSessao(req, res); if (!ator) return;
  const id = idDe(req); if (!id) return res.status(400).json({ error: "id inválido" });
  try { const r = await rejeitarPedido(id, ator); return r.ok ? res.json(r) : falha(res, r); }
  catch (e) { req.log?.error({ err: e }, "rejeitar pedido falhou"); return res.status(500).json({ error: "Falha ao rejeitar" }); }
});

router.post("/exames-lab/unidades/pedidos/:id/executar", requireCollaborator, moduleGuard("exames_lab"), async (req, res) => {
  const ator = atorDaSessao(req, res); if (!ator) return;
  const id = idDe(req); if (!id) return res.status(400).json({ error: "id inválido" });
  try { const r = await executarRevisao(id, ator); return r.ok ? res.json(r) : falha(res, r); }
  catch (e) { req.log?.error({ err: e }, "executar pedido falhou"); return res.status(500).json({ error: "Falha ao executar" }); }
});

export default router;
