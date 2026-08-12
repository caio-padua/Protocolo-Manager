/**
 * Painel CEO — Penalidades do Concierge
 *
 * GET  /admin/concierge-penalidade                   — lista todas (filtro ?cpf=)
 * PATCH /admin/concierge-penalidade/:cpf             — zera tentativas e desbloqueio
 * GET  /admin/concierge-penalidade/:cpf/historico    — histórico de resets desse CPF
 *
 * Acesso: requirePlatformOwner (CEO apenas)
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { requirePlatformOwner } from "../middleware/tenantContext";
import {
  listPenalidades,
  resetarPenalidade,
  listAuditoriaResets,
} from "../lib/concierge-penalidade";

const router = Router();

// ── GET /admin/concierge-penalidade ─────────────────────────────────────────
router.get(
  "/admin/concierge-penalidade",
  requirePlatformOwner,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const filtro = typeof req.query.cpf === "string" ? req.query.cpf : undefined;
      const rows = await listPenalidades(filtro);
      res.json({ ok: true, total: rows.length, rows });
    } catch (err) {
      res
        .status(500)
        .json({ ok: false, error: err instanceof Error ? err.message : "Erro interno" });
    }
  },
);

// ── GET /admin/concierge-penalidade/:cpf/historico ───────────────────────────
router.get(
  "/admin/concierge-penalidade/:cpf/historico",
  requirePlatformOwner,
  async (req: Request, res: Response): Promise<void> => {
    const cpf = String(req.params["cpf"] ?? "");
    if (!cpf || cpf.replace(/\D/g, "").length < 11) {
      res.status(400).json({ ok: false, error: "CPF inválido (mínimo 11 dígitos)" });
      return;
    }
    try {
      const rows = await listAuditoriaResets(cpf);
      res.json({ ok: true, total: rows.length, rows });
    } catch (err) {
      res
        .status(500)
        .json({ ok: false, error: err instanceof Error ? err.message : "Erro interno" });
    }
  },
);

// ── PATCH /admin/concierge-penalidade/:cpf ───────────────────────────────────
router.patch(
  "/admin/concierge-penalidade/:cpf",
  requirePlatformOwner,
  async (req: Request, res: Response): Promise<void> => {
    const cpf = String(req.params["cpf"] ?? "");
    if (!cpf || cpf.replace(/\D/g, "").length < 11) {
      res.status(400).json({ ok: false, error: "CPF inválido (mínimo 11 dígitos)" });
      return;
    }
    try {
      // Identifica quem fez o reset. Quando auth completa estiver implementada,
      // substituir por req.session?.usuario?.nome ou similar.
      const resetadoPor = "CEO";

      const resetou = await resetarPenalidade(cpf, resetadoPor);
      res.json({
        ok: true,
        resetou,
        message: resetou
          ? "Penalidade zerada com sucesso."
          : "CPF não encontrado na tabela de penalidades.",
      });
    } catch (err) {
      res
        .status(500)
        .json({ ok: false, error: err instanceof Error ? err.message : "Erro interno" });
    }
  },
);

export default router;
