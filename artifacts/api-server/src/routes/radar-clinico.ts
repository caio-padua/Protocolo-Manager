/**
 * radar-clinico.ts
 * Painel de Inteligência Clínica — visão operacional do médico.
 *
 * Endpoints:
 *   GET    /api/radar-clinico                    — lista de pacientes com dados agregados + filtros
 *   GET    /api/radar-clinico/substancias        — substâncias disponíveis para o filtro
 *   POST   /api/radar-clinico/diagnostico        — adiciona diagnóstico a um paciente
 *   DELETE /api/radar-clinico/diagnostico/:id    — remove diagnóstico
 */

import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { requireCeoInstance } from "../middleware/tenantContext";

const router = Router();

// ── Boot: criar tabela client_diagnosticos se não existir ─────────────────
(async () => {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS client_diagnosticos (
        id               SERIAL PRIMARY KEY,
        client_id        INTEGER NOT NULL,
        empresa_id       INTEGER NOT NULL,
        nome_diagnostico TEXT    NOT NULL,
        codigo_cid       TEXT,
        categoria        TEXT    DEFAULT 'outra',
        criado_em        TIMESTAMPTZ DEFAULT NOW(),
        atualizado_em    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_cd_client_empresa
      ON client_diagnosticos (client_id, empresa_id)
    `);
    logger.info("radar-clinico: tabela client_diagnosticos pronta");
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "radar-clinico: boot non-fatal");
  }
})();

// ── Helpers ───────────────────────────────────────────────────────────────
const getEmpresaId = (req: Request): number =>
  (req as any).empresaId ?? 5;

function buildBooleanFilter(cond: boolean, trueSql: ReturnType<typeof sql>, falseSql = sql`TRUE`) {
  return cond ? trueSql : falseSql;
}

// ── GET /api/radar-clinico ─────────────────────────────────────────────────
router.get("/radar-clinico", requireCeoInstance, async (req: Request, res: Response): Promise<void> => {
  try {
    const empresaId = getEmpresaId(req);

    // ── Filtros recebidos via query string ──────────────────────────────
    const faseMin        = req.query.faseMin        ? Number(req.query.faseMin)        : null;
    const faseMax        = req.query.faseMax        ? Number(req.query.faseMax)        : null;
    const procedureType  = (req.query.procedureType  as string | undefined) || null;
    const substancia     = (req.query.substancia     as string | undefined) || null;
    const diagnostico    = (req.query.diagnostico    as string | undefined) || null;
    const protocolStatus = (req.query.protocolStatus as string | undefined) || "all";
    const semFoto        = req.query.semFoto        === "true";
    const semContato     = req.query.semContato     === "true";
    const faltouHaDias   = req.query.faltouHaDias   ? Number(req.query.faltouHaDias)  : null;
    const page           = Math.max(1, Number(req.query.page  ?? 1));
    const limit          = Math.min(100, Number(req.query.limit ?? 50));
    const offset         = (page - 1) * limit;

    const rows = await db.execute(sql`
      WITH
      -- Protocolo com maior prioridade por cliente (ativo > validado > sugerido > outros)
      protocolo_recente AS (
        SELECT DISTINCT ON (client_id)
          client_id,
          id              AS protocol_id,
          title           AS protocol_title,
          status          AS protocol_status,
          start_date,
          end_date,
          completed_sessions,
          total_sessions,
          CASE WHEN start_date IS NOT NULL
            THEN EXTRACT(DAY FROM NOW() - start_date::date)::INT
            ELSE NULL
          END AS dias_ativo
        FROM protocols
        WHERE empresa_id = ${empresaId}
        ORDER BY
          client_id,
          CASE status
            WHEN 'active'    THEN 0
            WHEN 'validated' THEN 1
            WHEN 'suggested' THEN 2
            ELSE 3
          END,
          created_at DESC
      ),

      -- Substâncias agrupadas por cliente (somente protocolos ativos/validados)
      substancias_por_cliente AS (
        SELECT
          p.client_id,
          JSONB_AGG(DISTINCT JSONB_BUILD_OBJECT(
            'id',            s.id,
            'name',          s.name,
            'procedureType', s.procedure_type,
            'category',      s.category,
            'color',         s.color
          )) AS substances,
          COUNT(DISTINCT s.id)::INT AS total_injetaveis
        FROM protocols p
        JOIN protocol_items pi ON pi.protocol_id = p.id
        JOIN substances     s  ON s.id           = pi.substance_id
        WHERE p.empresa_id = ${empresaId}
          AND p.status IN ('active', 'validated')
        GROUP BY p.client_id
      ),

      -- Última sessão concluída + próxima sessão agendada
      sessoes_por_cliente AS (
        SELECT
          client_id,
          MAX(CASE WHEN status = 'completed'
              THEN scheduled_date END)                          AS ultima_sessao,
          MIN(CASE WHEN status IN ('scheduled','pending')
                    AND scheduled_date >= TO_CHAR(NOW(), 'YYYY-MM-DD')
              THEN scheduled_date END)                          AS proxima_sessao,
          CASE WHEN MAX(CASE WHEN status = 'completed' THEN scheduled_date END) IS NOT NULL
            THEN EXTRACT(DAY FROM
                   NOW() - MAX(CASE WHEN status = 'completed' THEN scheduled_date END)::date
                 )::INT
            ELSE NULL
          END AS dias_desde_ultima_sessao
        FROM sessions
        WHERE empresa_id = ${empresaId}
        GROUP BY client_id
      ),

      -- Diagnósticos por cliente
      diagnosticos_por_cliente AS (
        SELECT
          client_id,
          JSONB_AGG(JSONB_BUILD_OBJECT(
            'id',        id,
            'nome',      nome_diagnostico,
            'cid',       codigo_cid,
            'categoria', categoria
          ) ORDER BY criado_em) AS diagnosticos
        FROM client_diagnosticos
        WHERE empresa_id = ${empresaId}
        GROUP BY client_id
      )

      SELECT
        c.id,
        c.name,
        c.cpf,
        c.phone,
        c.email,
        c.birth_date,
        c.photo_url,
        c.status                      AS client_status,

        pr.protocol_id,
        pr.protocol_title,
        pr.protocol_status,
        pr.start_date,
        pr.end_date,
        pr.dias_ativo,
        pr.completed_sessions,
        pr.total_sessions,

        sc.substances,
        sc.total_injetaveis,

        se.ultima_sessao,
        se.proxima_sessao,
        se.dias_desde_ultima_sessao,

        dp.diagnosticos,

        (c.photo_url IS NULL OR c.photo_url = '')   AS sem_foto,
        (c.phone IS NULL AND c.email IS NULL)        AS contato_incompleto

      FROM clients c
      LEFT JOIN protocolo_recente        pr ON pr.client_id = c.id
      LEFT JOIN substancias_por_cliente  sc ON sc.client_id = c.id
      LEFT JOIN sessoes_por_cliente      se ON se.client_id = c.id
      LEFT JOIN diagnosticos_por_cliente dp ON dp.client_id = c.id

      WHERE c.empresa_id = ${empresaId}
        AND c.status      = 'active'

        -- Filtro: sem foto
        AND (NOT ${semFoto} OR (c.photo_url IS NULL OR c.photo_url = ''))

        -- Filtro: sem contato
        AND (NOT ${semContato} OR (c.phone IS NULL AND c.email IS NULL))

        -- Filtro: status do protocolo
        AND (
          ${protocolStatus} = 'all'
          OR (${protocolStatus} = 'active'   AND pr.protocol_status IN ('active','validated'))
          OR (${protocolStatus} = 'inactive' AND (pr.protocol_status IS NULL
                OR pr.protocol_status NOT IN ('active','validated')))
        )

        -- Filtro: fase mínima (dias ativos)
        AND (${faseMin}::int IS NULL OR pr.dias_ativo >= ${faseMin}::int)

        -- Filtro: fase máxima (dias ativos)
        AND (${faseMax}::int IS NULL OR pr.dias_ativo <= ${faseMax}::int)

        -- Filtro: faltou há X dias ou mais
        AND (${faltouHaDias}::int IS NULL OR se.dias_desde_ultima_sessao >= ${faltouHaDias}::int)

        -- Filtro: tipo de via (procedure_type)
        AND (
          ${procedureType} IS NULL
          OR EXISTS (
            SELECT 1 FROM protocols p2
            JOIN protocol_items pi2 ON pi2.protocol_id = p2.id
            JOIN substances     s2  ON s2.id           = pi2.substance_id
            WHERE p2.client_id   = c.id
              AND p2.empresa_id  = ${empresaId}
              AND p2.status IN ('active','validated')
              AND LOWER(s2.procedure_type) ILIKE '%' || LOWER(${procedureType ?? ''}) || '%'
          )
        )

        -- Filtro: substância pelo nome
        AND (
          ${substancia} IS NULL
          OR EXISTS (
            SELECT 1 FROM protocols p3
            JOIN protocol_items pi3 ON pi3.protocol_id = p3.id
            JOIN substances     s3  ON s3.id           = pi3.substance_id
            WHERE p3.client_id  = c.id
              AND p3.empresa_id = ${empresaId}
              AND p3.status IN ('active','validated')
              AND LOWER(s3.name) ILIKE '%' || LOWER(${substancia ?? ''}) || '%'
          )
        )

        -- Filtro: diagnóstico
        AND (
          ${diagnostico} IS NULL
          OR EXISTS (
            SELECT 1 FROM client_diagnosticos cd
            WHERE cd.client_id  = c.id
              AND cd.empresa_id = ${empresaId}
              AND LOWER(cd.nome_diagnostico) ILIKE '%' || LOWER(${diagnostico ?? ''}) || '%'
          )
        )

      ORDER BY
        CASE WHEN pr.protocol_status IN ('active','validated') THEN 0 ELSE 1 END,
        pr.dias_ativo DESC NULLS LAST,
        c.name ASC

      LIMIT  ${limit}
      OFFSET ${offset}
    `);

    res.json({
      ok:        true,
      page,
      limit,
      total:     rows.rows.length,
      pacientes: rows.rows,
    });
  } catch (e: any) {
    logger.error({ err: e }, "radar-clinico: erro na consulta principal");
    res.status(500).json({ error: e?.message ?? "Erro interno" });
  }
});

// ── GET /api/radar-clinico/substancias ────────────────────────────────────
router.get("/radar-clinico/substancias", requireCeoInstance, async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db.execute(sql`
      SELECT DISTINCT id, name, procedure_type, category, color
      FROM substances
      ORDER BY name ASC
      LIMIT 300
    `);
    res.json({ ok: true, substancias: rows.rows });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ── POST /api/radar-clinico/diagnostico ───────────────────────────────────
router.post("/radar-clinico/diagnostico", requireCeoInstance, async (req: Request, res: Response): Promise<void> => {
  try {
    const empresaId = getEmpresaId(req);
    const { clientId, nomeDiagnostico, codigoCid, categoria } = req.body as {
      clientId?:        number;
      nomeDiagnostico?: string;
      codigoCid?:       string;
      categoria?:       string;
    };

    if (!clientId || !nomeDiagnostico?.trim()) {
      res.status(400).json({ error: "clientId e nomeDiagnostico são obrigatórios" });
      return;
    }

    const result = await db.execute(sql`
      INSERT INTO client_diagnosticos (client_id, empresa_id, nome_diagnostico, codigo_cid, categoria)
      VALUES (${clientId}, ${empresaId}, ${nomeDiagnostico.trim()}, ${codigoCid ?? null}, ${categoria ?? "outra"})
      RETURNING id, client_id, nome_diagnostico, codigo_cid, categoria, criado_em
    `);

    res.status(201).json({ ok: true, diagnostico: result.rows[0] });
  } catch (e: any) {
    logger.error({ err: e }, "radar-clinico: erro ao salvar diagnóstico");
    res.status(500).json({ error: e?.message ?? "Erro interno" });
  }
});

// ── DELETE /api/radar-clinico/diagnostico/:id ─────────────────────────────
router.delete("/radar-clinico/diagnostico/:id", requireCeoInstance, async (req: Request, res: Response): Promise<void> => {
  try {
    const empresaId = getEmpresaId(req);
    await db.execute(sql`
      DELETE FROM client_diagnosticos
      WHERE id = ${Number(req.params.id)} AND empresa_id = ${empresaId}
    `);
    res.json({ ok: true });
  } catch (e: any) {
    logger.error({ err: e }, "radar-clinico: erro ao deletar diagnóstico");
    res.status(500).json({ error: e?.message ?? "Erro interno" });
  }
});

export default router;
