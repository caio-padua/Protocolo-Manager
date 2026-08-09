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
import { resolveEmpresaId } from "../middleware/tenantContext";

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
const getEmpresaId = (req: Request): number => resolveEmpresaId(req); // eslint-disable-next-line @typescript-eslint/no-unused-vars
const _getEmpresaIdLegacy = (req: Request): number =>
  (req as any).empresaId ?? 5;

function buildBooleanFilter(cond: boolean, trueSql: ReturnType<typeof sql>, falseSql = sql`TRUE`) {
  return cond ? trueSql : falseSql;
}

// ── GET /api/radar-clinico ─────────────────────────────────────────────────
router.get("/radar-clinico", async (req: Request, res: Response): Promise<void> => {
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

    // ── Fragmentos SQL condicionais (null = filtro desligado) ──────────────
    const filtFaseMin     = faseMin     !== null ? sql`AND pr.dias_ativo >= ${faseMin}`                      : sql``;
    const filtFaseMax     = faseMax     !== null ? sql`AND pr.dias_ativo <= ${faseMax}`                      : sql``;
    const filtFaltou      = faltouHaDias !== null ? sql`AND se.dias_desde_ultima_sessao >= ${faltouHaDias}`  : sql``;
    const filtProto       = protocolStatus === "all"
      ? sql``
      : protocolStatus === "active"
        ? sql`AND pr.protocol_status IN ('active','validated')`
        : sql`AND (pr.protocol_status IS NULL OR pr.protocol_status NOT IN ('active','validated'))`;
    const filtVia         = procedureType !== null
      ? sql`AND EXISTS (
            SELECT 1 FROM protocols p2
            JOIN protocol_items pi2 ON pi2.protocol_id = p2.id
            JOIN substances     s2  ON s2.id           = pi2.substance_id
            WHERE p2.client_id  = c.id
              AND p2.empresa_id = ${empresaId}
              AND p2.status IN ('active','validated')
              AND LOWER(s2.procedure_type) ILIKE '%' || LOWER(${procedureType}) || '%'
          )`
      : sql``;
    const filtSubst       = substancia !== null
      ? sql`AND EXISTS (
            SELECT 1 FROM protocols p3
            JOIN protocol_items pi3 ON pi3.protocol_id = p3.id
            JOIN substances     s3  ON s3.id           = pi3.substance_id
            WHERE p3.client_id  = c.id
              AND p3.empresa_id = ${empresaId}
              AND p3.status IN ('active','validated')
              AND LOWER(s3.name) ILIKE '%' || LOWER(${substancia}) || '%'
          )`
      : sql``;
    const filtDiag        = diagnostico !== null
      ? sql`AND EXISTS (
            SELECT 1 FROM client_diagnosticos cd
            WHERE cd.client_id  = c.id
              AND cd.empresa_id = ${empresaId}
              AND LOWER(cd.nome_diagnostico) ILIKE '%' || LOWER(${diagnostico}) || '%'
          )`
      : sql``;

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

        -- Filtros condicionais (fragmentos pré-construídos — null = desligado)
        ${filtProto}
        ${filtFaseMin}
        ${filtFaseMax}
        ${filtFaltou}
        ${filtVia}
        ${filtSubst}
        ${filtDiag}

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
router.get("/radar-clinico/substancias", async (_req: Request, res: Response): Promise<void> => {
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
router.post("/radar-clinico/diagnostico", async (req: Request, res: Response): Promise<void> => {
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
router.delete("/radar-clinico/diagnostico/:id", async (req: Request, res: Response): Promise<void> => {
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

// ── GET /api/radar-clinico/seed-demo ──────────────────────────────────────
// Insere 10 pacientes demo com protocolos, sessões e diagnósticos variados.
// Idempotente: verifica pelo CPF marcador antes de inserir.
router.get("/radar-clinico/seed-demo", async (_req: Request, res: Response): Promise<void> => {
  try {
    // Verifica se demo já existe
    const check = await db.execute(sql`
      SELECT id FROM clients WHERE cpf = '000.000.001-01' AND empresa_id = 5 LIMIT 1
    `);
    if (check.rows.length > 0) {
      res.json({ ok: true, msg: "Dados demo já existem — sem alteração.", total: 10 });
      return;
    }

    // ── Dados dos 10 pacientes demo ──────────────────────────────────
    const hoje = "2026-08-09";

    type SessionEntry = { date: string; status: "completed" | "scheduled" };
    type DiagEntry    = { nome: string; cid: string; cat: string };
    type PatientSeed  = {
      name: string; cpf: string; phone: string; email: string;
      birth: string; photo: string | null;
      proto?: {
        title: string; status: string; start: string;
        total: number; completed: number;
        subIds: number[];   // IDs de substances reais no banco
        sessions: SessionEntry[];
      };
      diag: DiagEntry[];
    };

    const PATIENTS: PatientSeed[] = [
      {
        name: "Ana Carolina Souza",  cpf: "000.000.001-01",
        phone: "(11) 91111-0001", email: "ana.souza@exemplo.com",
        birth: "1985-03-15",     photo: "https://i.pravatar.cc/200?img=1",
        proto: {
          title: "Protocolo Metabólico Feminino", status: "active",
          start: "2026-06-25", total: 12, completed: 6,
          subIds: [6, 14], // Vitamina D3+K2 (im), Coenzima Q10 (im)
          sessions: [
            { date: "2026-07-02", status: "completed" },
            { date: "2026-07-09", status: "completed" },
            { date: "2026-07-16", status: "completed" },
            { date: "2026-07-23", status: "completed" },
            { date: "2026-07-30", status: "completed" },
            { date: "2026-08-04", status: "completed" },   // última — faltou há 5d
          ],
        },
        diag: [
          { nome: "Diabetes Mellitus tipo 2", cid: "E11",  cat: "metabolica" },
          { nome: "Hipotireoidismo",           cid: "E03",  cat: "endocrina"  },
        ],
      },
      {
        name: "Bruno Henrique Lima",  cpf: "000.000.002-02",
        phone: "(11) 92222-0002", email: "bruno.lima@exemplo.com",
        birth: "1978-07-22",     photo: "https://i.pravatar.cc/200?img=11",
        proto: {
          title: "IV Antioxidante Premium", status: "active",
          start: "2026-04-11", total: 24, completed: 17,
          subIds: [1, 4], // Glutationa (iv), NAD+ (iv)
          sessions: [
            { date: "2026-07-31", status: "completed" },
            { date: "2026-08-07", status: "completed" },
            { date: "2026-08-10", status: "scheduled" },  // próxima: amanhã
            { date: "2026-08-14", status: "scheduled" },
          ],
        },
        diag: [
          { nome: "Obesidade", cid: "E66", cat: "metabolica" },
        ],
      },
      {
        name: "Carlos Eduardo Mendes",  cpf: "000.000.003-03",
        phone: "(11) 93333-0003", email: "carlos.mendes@exemplo.com",
        birth: "1992-11-08",     photo: "https://i.pravatar.cc/200?img=12",
        proto: {
          title: "Suplementação Oral Básica", status: "suggested",
          start: "2026-07-30", total: 6, completed: 1,
          subIds: [7], // Complexo B (im)
          sessions: [
            { date: "2026-07-30", status: "completed" },
            { date: "2026-08-13", status: "scheduled" },
          ],
        },
        diag: [
          { nome: "Síndrome Metabólica", cid: "E88.8", cat: "metabolica" },
        ],
      },
      {
        name: "Daniela Ferreira Costa",  cpf: "000.000.004-04",
        phone: "(11) 94444-0004", email: "daniela.costa@exemplo.com",
        birth: "1969-04-30",     photo: "https://i.pravatar.cc/200?img=5",
        proto: {
          title: "Protocolo Hormonal Completado", status: "completed",
          start: "2025-09-01", total: 18, completed: 18,
          subIds: [6, 8], // Vitamina D3+K2 (im), Zinco+Selênio (im)
          sessions: [
            { date: "2026-07-01", status: "completed" },
          ],
        },
        diag: [
          { nome: "Dislipidemia", cid: "E78", cat: "cardiovascular" },
        ],
      },
      {
        name: "Eduardo Rodrigues Silva",  cpf: "000.000.005-05",
        phone: "(11) 95555-0005", email: "eduardo.silva@exemplo.com",
        birth: "1983-12-01",     photo: "https://i.pravatar.cc/200?img=15",
        proto: {
          title: "Suplementação Cardiometabólica", status: "active",
          start: "2026-08-01", total: 10, completed: 2,
          subIds: [8, 6], // Zinco+Selênio (im), Vitamina D3+K2 (im)
          sessions: [
            { date: "2026-07-30", status: "completed" },  // faltou há 10d — ALERTA
            { date: "2026-08-01", status: "completed" },
          ],
        },
        diag: [
          { nome: "Hipertensão Arterial",  cid: "I10",  cat: "cardiovascular" },
          { nome: "Pré-diabetes",          cid: "R73",  cat: "metabolica"     },
        ],
      },
      {
        name: "Fernanda Alves Pereira",  cpf: "000.000.006-06",
        phone: "(11) 96666-0006", email: "fernanda.pereira@exemplo.com",
        birth: "1976-09-14",     photo: "https://i.pravatar.cc/200?img=9",
        proto: {
          title: "Implante Hormonal — Longa Duração", status: "validated",
          start: "2026-01-21", total: 4, completed: 3,
          subIds: [10], // Implante Gestrinona 20mg
          sessions: [
            { date: "2026-08-05", status: "completed" },
            { date: "2026-09-05", status: "scheduled" },
          ],
        },
        diag: [
          { nome: "Resistência à Insulina", cid: "E88.8", cat: "metabolica" },
        ],
      },
      {
        name: "Gabriel Martins Santos",  cpf: "000.000.007-07",
        phone: "(11) 97777-0007", email: "gabriel.santos@exemplo.com",
        birth: "2001-05-25",     photo: null,  // SEM FOTO — alerta admin
        proto: undefined,                       // SEM PROTOCOLO
        diag: [],
      },
      {
        name: "Helena Cristina Barbosa",  cpf: "000.000.008-08",
        phone: null as any, email: null as any, // SEM CONTATO — alerta admin
        birth: "1990-01-19",     photo: "https://i.pravatar.cc/200?img=3",
        proto: {
          title: "IV Antioxidante + Vitamina D", status: "active",
          start: "2026-06-10", total: 16, completed: 9,
          subIds: [2, 1], // Vitamina C Endovenosa (iv), Glutationa (iv)
          sessions: [
            { date: "2026-08-06", status: "completed" },
            { date: "2026-08-13", status: "scheduled" },
          ],
        },
        diag: [
          { nome: "Deficiência de Vitamina D", cid: "E55", cat: "nutricional" },
          { nome: "Obesidade",                 cid: "E66", cat: "metabolica"  },
        ],
      },
      {
        name: "Igor Cavalcanti Neto",  cpf: "000.000.009-09",
        phone: "(85) 99999-0009", email: "igor.cavalcanti@exemplo.com",
        birth: "1988-08-03",     photo: "https://i.pravatar.cc/200?img=17",
        proto: {
          title: "Suplementação Antioxidante", status: "active",
          start: "2026-07-25", total: 8, completed: 3,
          subIds: [14, 7], // Coenzima Q10 (im), Complexo B (im)
          sessions: [
            { date: "2026-07-25", status: "completed" },
            { date: "2026-08-01", status: "completed" },
            { date: "2026-08-02", status: "completed" }, // faltou há 7d — ALERTA
          ],
        },
        diag: [],
      },
      {
        name: "Juliana Nascimento Reis",  cpf: "000.000.010-10",
        phone: "(21) 98888-0010", email: "juliana.reis@exemplo.com",
        birth: "1980-06-11",     photo: "https://i.pravatar.cc/200?img=7",
        proto: {
          title: "Protocolo Integrado SC + Implante", status: "active",
          start: "2026-05-11", total: 12, completed: 8,
          subIds: [10, 3], // Implante Gestrinona (implant), Fosfatidilcolina (iv)
          sessions: [
            { date: "2026-08-07", status: "completed" },
            { date: "2026-09-07", status: "scheduled" },
          ],
        },
        diag: [
          { nome: "Pré-diabetes",          cid: "R73",   cat: "metabolica" },
          { nome: "Resistência à Insulina",cid: "E88.8", cat: "metabolica" },
          { nome: "Hiperomocisteinemia",   cid: "E72.1", cat: "metabolica" },
        ],
      },
    ];

    const insertedClients: number[] = [];

    for (const p of PATIENTS) {
      // 1. Inserir cliente
      const cliRes = await db.execute(sql`
        INSERT INTO clients (name, cpf, phone, email, birth_date, photo_url, status, empresa_id, location_id)
        VALUES (
          ${p.name}, ${p.cpf}, ${p.phone ?? null}, ${p.email ?? null},
          ${p.birth}, ${p.photo ?? null},
          'active', 5, 8
        )
        RETURNING id
      `);
      const clientId = (cliRes.rows[0] as any).id as number;
      insertedClients.push(clientId);

      if (!p.proto) continue;

      // 2. Inserir protocolo
      const protoRes = await db.execute(sql`
        INSERT INTO protocols (client_id, empresa_id, title, status, start_date, total_sessions, completed_sessions)
        VALUES (${clientId}, 5, ${p.proto.title}, ${p.proto.status}, ${p.proto.start}, ${p.proto.total}, ${p.proto.completed})
        RETURNING id
      `);
      const protocolId = (protoRes.rows[0] as any).id as number;

      // 3. Inserir protocol_items (uma por substância)
      for (const subId of p.proto.subIds) {
        await db.execute(sql`
          INSERT INTO protocol_items (protocol_id, substance_id, dose, interval_days, frequency, completed_sessions)
          VALUES (${protocolId}, ${subId}, '1 ampola', 7, 'semanal', ${Math.floor(p.proto.completed / p.proto.subIds.length)})
        `);
      }

      // 4. Inserir sessões
      for (const sess of p.proto.sessions) {
        await db.execute(sql`
          INSERT INTO sessions (protocol_id, client_id, substance_id, scheduled_date, status, empresa_id)
          VALUES (${protocolId}, ${clientId}, ${p.proto.subIds[0]}, ${sess.date}, ${sess.status}, 5)
        `);
      }

      // 5. Inserir diagnósticos
      for (const d of p.diag) {
        await db.execute(sql`
          INSERT INTO client_diagnosticos (client_id, empresa_id, nome_diagnostico, codigo_cid, categoria)
          VALUES (${clientId}, 5, ${d.nome}, ${d.cid}, ${d.cat})
        `);
      }
    }

    logger.info({ insertedClients }, "radar-clinico: seed-demo concluído");
    res.json({ ok: true, msg: `${insertedClients.length} pacientes demo inseridos.`, clientIds: insertedClients });
  } catch (e: any) {
    logger.error({ err: e }, "radar-clinico: erro no seed-demo");
    res.status(500).json({ error: e?.message ?? "Erro interno no seed" });
  }
});

export default router;

