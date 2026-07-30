/**
 * AI Usage Ledger — Ledger interno de custo de IA por clínica (Item B — Kaizen)
 *
 * GET /api/ai-usage/resumo?periodo=30d  → custo agregado por empresa_id
 *
 * Acesso: requirePlatformOwner (apenas CEO)
 *
 * A tabela ai_usage_log é criada aqui via CREATE TABLE IF NOT EXISTS
 * (padrão: migration gradual, sem db push, sem DROP).
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requirePlatformOwner } from "../middleware/tenantContext";

const router = Router();

// ── Criação idempotente da tabela (boot migration gradual) ────────────────────
// Nunca lança — falha silenciosa para não travar o boot.
(async () => {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ai_usage_log (
        id           SERIAL PRIMARY KEY,
        empresa_id   INTEGER NOT NULL,
        provider     TEXT    NOT NULL,
        tipo         TEXT    NOT NULL,
        input_tokens INTEGER,
        output_tokens INTEGER,
        custo_usd    NUMERIC(10,6),
        created_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Índice para buscas rápidas por empresa + período
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS ai_usage_log_empresa_created
        ON ai_usage_log (empresa_id, created_at DESC)
    `);
  } catch {
    // fail silently — tabela pode já existir em ambiente de produção
  }
})();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PERIODOS: Record<string, string> = {
  "7d":  "7 days",
  "30d": "30 days",
  "90d": "90 days",
};

// ── GET /api/ai-usage/resumo ──────────────────────────────────────────────────

router.get(
  "/ai-usage/resumo",
  requirePlatformOwner,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const periodoParam = String(req.query.periodo ?? "30d");
      const intervalo = PERIODOS[periodoParam] ?? "30 days";

      // Resumo por empresa_id + provider + tipo
      const detalhes = await db.execute(sql`
        SELECT
          u.empresa_id,
          COALESCE(e.nick, e.nome, 'Clínica ' || u.empresa_id::text) AS nome_empresa,
          u.provider,
          u.tipo,
          COUNT(*)::int                         AS total_chamadas,
          COALESCE(SUM(u.input_tokens),0)::int  AS input_tokens,
          COALESCE(SUM(u.output_tokens),0)::int AS output_tokens,
          COALESCE(SUM(u.custo_usd), 0)         AS custo_usd
        FROM ai_usage_log u
        LEFT JOIN empresas e ON e.id = u.empresa_id
        WHERE u.created_at >= now() - (${intervalo}::interval)
        GROUP BY u.empresa_id, e.nick, e.nome, u.provider, u.tipo
        ORDER BY custo_usd DESC
      `);

      // Totais globais
      const totaisR = await db.execute(sql`
        SELECT
          COUNT(*)::int                         AS total_chamadas,
          COALESCE(SUM(input_tokens),0)::int    AS input_tokens,
          COALESCE(SUM(output_tokens),0)::int   AS output_tokens,
          COALESCE(SUM(custo_usd), 0)           AS custo_usd
        FROM ai_usage_log
        WHERE created_at >= now() - (${intervalo}::interval)
      `);

      const totais = totaisR.rows[0] as Record<string, number | string>;
      const custoUsd  = parseFloat(String(totais.custo_usd  ?? 0));
      const custoBrl  = parseFloat((custoUsd * 5.5).toFixed(2));

      res.json({
        ok: true,
        periodo: periodoParam,
        data: detalhes.rows,
        total_chamadas:  Number(totais.total_chamadas  ?? 0),
        total_input_tokens:  Number(totais.input_tokens  ?? 0),
        total_output_tokens: Number(totais.output_tokens ?? 0),
        total_custo_usd: parseFloat(custoUsd.toFixed(6)),
        total_custo_brl: custoBrl,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Erro interno",
      });
    }
  },
);

export default router;
