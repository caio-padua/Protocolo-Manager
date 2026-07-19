/**
 * Agentes — Dashboard de Integrações ao Vivo (Kaizen C)
 * GET /agentes-integracoes/dashboard — KPIs + log recente de Trello, WPP, webhooks
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { agent_integration_log } from "@workspace/db/schema/agent-integration-log";
import { desc, gte } from "drizzle-orm";

const router: IRouter = Router();

// Garante que a tabela existe (boot-safe)
async function ensureTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agent_integration_log (
      id           SERIAL PRIMARY KEY,
      tipo         TEXT NOT NULL,
      agente_id    INTEGER,
      client_id    INTEGER,
      status       TEXT NOT NULL DEFAULT 'ok',
      detalhe      JSONB,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
ensureTables().catch(() => {});

// ─── GET /agentes-integracoes/dashboard ──────────────────────────────────────
router.get("/agentes-integracoes/dashboard", async (req, res): Promise<void> => {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const [
      totalTrelloRows,
      hojeTrelloRows,
      totalWppRows,
      hojeWppRows,
      logRecente,
    ] = await Promise.all([
      db.execute(sql`SELECT COUNT(*)::int AS n FROM agent_integration_log WHERE tipo = 'trello_card'`),
      db.execute(sql`SELECT COUNT(*)::int AS n FROM agent_integration_log WHERE tipo = 'trello_card' AND created_at >= ${hoje.toISOString()}`),
      db.execute(sql`SELECT COUNT(*)::int AS n FROM agent_integration_log WHERE tipo LIKE 'wpp%'`),
      db.execute(sql`SELECT COUNT(*)::int AS n FROM agent_integration_log WHERE tipo LIKE 'wpp%' AND created_at >= ${hoje.toISOString()}`),
      db.execute(sql`
        SELECT
          l.id, l.tipo, l.status, l.detalhe, l.created_at,
          a.nome AS agente_nome
        FROM agent_integration_log l
        LEFT JOIN catalogo_agentes a ON a.id = l.agente_id
        ORDER BY l.created_at DESC
        LIMIT 20
      `),
    ]);

    const ultimaTrello = await db.execute(sql`SELECT created_at FROM agent_integration_log WHERE tipo = 'trello_card' ORDER BY created_at DESC LIMIT 1`);
    const ultimaWpp    = await db.execute(sql`SELECT created_at FROM agent_integration_log WHERE tipo LIKE 'wpp%' ORDER BY created_at DESC LIMIT 1`);

    res.json({
      trello: {
        total_cards:     (totalTrelloRows.rows[0] as any)?.n ?? 0,
        hoje:            (hojeTrelloRows.rows[0]  as any)?.n ?? 0,
        ultima_atividade:(ultimaTrello.rows[0]    as any)?.created_at ?? null,
      },
      wpp: {
        total_enviadas:  (totalWppRows.rows[0] as any)?.n ?? 0,
        hoje:            (hojeWppRows.rows[0]  as any)?.n ?? 0,
        ultima_atividade:(ultimaWpp.rows[0]    as any)?.created_at ?? null,
      },
      log_recente: logRecente.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Função utilitária exportada — gravar log de integração ──────────────────
export async function logIntegracao(params: {
  tipo: string;
  agente_id?: number | null;
  client_id?: number | null;
  status?: "ok" | "falhou" | "skip";
  detalhe?: Record<string, unknown>;
}) {
  try {
    await db.execute(sql`
      INSERT INTO agent_integration_log (tipo, agente_id, client_id, status, detalhe)
      VALUES (
        ${params.tipo},
        ${params.agente_id ?? null},
        ${params.client_id ?? null},
        ${params.status ?? "ok"},
        ${JSON.stringify(params.detalhe ?? {})}::jsonb
      )
    `);
  } catch {
    // fire-and-forget: nunca lançar
  }
}

export default router;
