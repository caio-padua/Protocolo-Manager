/**
 * Agentes — Quick Replies CRUD (Kaizen D)
 * GET  /agentes/:id/quick-replies
 * POST /agentes/:id/quick-replies
 * PUT  /agentes/:id/quick-replies/:qid
 * DELETE /agentes/:id/quick-replies/:qid
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

// Garante tabela no boot
async function ensureTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agent_quick_replies (
      id         SERIAL PRIMARY KEY,
      agente_id  INTEGER NOT NULL,
      texto      TEXT NOT NULL,
      ordem      INTEGER NOT NULL DEFAULT 1,
      ativo      BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Seed: Aurora ADM (role = agente_adm_01) — apenas se não existir nada
  await db.execute(sql`
    DO $$
    DECLARE v_id INTEGER;
    BEGIN
      SELECT id INTO v_id FROM catalogo_agentes WHERE codigo = 'agente_adm_01' LIMIT 1;
      IF v_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM agent_quick_replies WHERE agente_id = v_id
      ) THEN
        INSERT INTO agent_quick_replies (agente_id, texto, ordem) VALUES
          (v_id, 'Confirmar agendamento da consulta', 1),
          (v_id, 'Enviar protocolo para assinatura', 2),
          (v_id, 'Encerrar atendimento e registrar resumo', 3);
      END IF;
    END $$;
  `);
}
ensureTables().catch(() => {});

// GET /agentes/:id/quick-replies
router.get("/agentes/:id/quick-replies", async (req, res): Promise<void> => {
  const agenteId = parseInt(req.params.id, 10);
  if (isNaN(agenteId)) { res.status(400).json({ error: "id inválido" }); return; }
  const rows = await db.execute(sql`
    SELECT * FROM agent_quick_replies
    WHERE agente_id = ${agenteId}
    ORDER BY ordem ASC, id ASC
    LIMIT 6
  `);
  res.json({ items: rows.rows });
});

// POST /agentes/:id/quick-replies
router.post("/agentes/:id/quick-replies", async (req, res): Promise<void> => {
  const agenteId = parseInt(req.params.id, 10);
  if (isNaN(agenteId)) { res.status(400).json({ error: "id inválido" }); return; }
  const { texto, ordem } = req.body ?? {};
  if (!texto || typeof texto !== "string") { res.status(400).json({ error: "texto obrigatório" }); return; }
  const textoTrimmed = texto.trim().slice(0, 120);
  const ordemNum = typeof ordem === "number" ? ordem : 1;
  const [row] = (await db.execute(sql`
    INSERT INTO agent_quick_replies (agente_id, texto, ordem)
    VALUES (${agenteId}, ${textoTrimmed}, ${ordemNum})
    RETURNING *
  `)).rows;
  res.status(201).json(row);
});

// PUT /agentes/:id/quick-replies/:qid
router.put("/agentes/:id/quick-replies/:qid", async (req, res): Promise<void> => {
  const agenteId = parseInt(req.params.id, 10);
  const qid      = parseInt(req.params.qid, 10);
  if (isNaN(agenteId) || isNaN(qid)) { res.status(400).json({ error: "id inválido" }); return; }
  const { texto, ordem, ativo } = req.body ?? {};
  const updates: string[] = [];
  if (typeof texto  === "string")  updates.push(`texto = '${texto.trim().slice(0,120).replace(/'/g,"''")}'`);
  if (typeof ordem  === "number")  updates.push(`ordem = ${ordem}`);
  if (typeof ativo  === "boolean") updates.push(`ativo = ${ativo}`);
  if (updates.length === 0) { res.status(400).json({ error: "nenhum campo para atualizar" }); return; }
  const [row] = (await db.execute(sql.raw(`
    UPDATE agent_quick_replies SET ${updates.join(", ")}
    WHERE id = ${qid} AND agente_id = ${agenteId}
    RETURNING *
  `))).rows;
  if (!row) { res.status(404).json({ error: "não encontrado" }); return; }
  res.json(row);
});

// DELETE /agentes/:id/quick-replies/:qid
router.delete("/agentes/:id/quick-replies/:qid", async (req, res): Promise<void> => {
  const agenteId = parseInt(req.params.id, 10);
  const qid      = parseInt(req.params.qid, 10);
  if (isNaN(agenteId) || isNaN(qid)) { res.status(400).json({ error: "id inválido" }); return; }
  await db.execute(sql`
    DELETE FROM agent_quick_replies WHERE id = ${qid} AND agente_id = ${agenteId}
  `);
  res.json({ ok: true });
});

export default router;
