/**
 * PAXTER — PADTEAM Router
 * Módulo completo de demandas para operadores remotos (+ agentes IA).
 *
 * Tabelas gerenciadas via raw SQL (CREATE TABLE IF NOT EXISTS):
 *   team_positions, team_members, delegacoes, sla_monitoring,
 *   delegacao_justificativas, delegacao_escalations,
 *   commission_events, disciplinary_events
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── Init: criar tabelas se não existirem ─────────────────────────────────────

async function initTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS team_positions (
      id          SERIAL PRIMARY KEY,
      nome        TEXT NOT NULL,
      codigo      TEXT NOT NULL UNIQUE,
      descricao   TEXT,
      cor_hex     TEXT DEFAULT '#3D7A7A',
      nivel       INTEGER DEFAULT 1,
      pode_receber_demandas BOOLEAN DEFAULT true,
      pode_criar_demandas   BOOLEAN DEFAULT false,
      sla_horas   INTEGER DEFAULT 24,
      criado_em   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS team_members (
      id                       SERIAL PRIMARY KEY,
      nome                     TEXT NOT NULL,
      email                    TEXT,
      telefone                 TEXT,
      cargo_id                 INTEGER REFERENCES team_positions(id),
      tipo                     TEXT NOT NULL DEFAULT 'humano',
      status                   TEXT NOT NULL DEFAULT 'ativo',
      especialidades           TEXT[],
      max_demandas_simultaneas INTEGER DEFAULT 5,
      professional_id          INTEGER,
      observacoes              TEXT,
      criado_em                TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS delegacoes (
      id                  SERIAL PRIMARY KEY,
      titulo              TEXT NOT NULL,
      descricao           TEXT,
      tipo                TEXT NOT NULL DEFAULT 'manual',
      origem              TEXT,
      prioridade          TEXT NOT NULL DEFAULT 'normal',
      status              TEXT NOT NULL DEFAULT 'aberto',
      assigned_role       TEXT,
      assigned_member_id  INTEGER REFERENCES team_members(id),
      client_id           INTEGER,
      protocol_id         INTEGER,
      prazo_horas         INTEGER DEFAULT 24,
      prazo_em            TIMESTAMPTZ,
      concluido_em        TIMESTAMPTZ,
      concluido_por       INTEGER REFERENCES team_members(id),
      trello_card_id      TEXT,
      trello_list_id      TEXT,
      notas               TEXT,
      resultado           TEXT,
      criado_por          INTEGER REFERENCES team_members(id),
      criado_em           TIMESTAMPTZ DEFAULT NOW(),
      atualizado_em       TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sla_monitoring (
      id              SERIAL PRIMARY KEY,
      delegacao_id    INTEGER REFERENCES delegacoes(id),
      sla_horas       INTEGER NOT NULL,
      iniciou_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      prazo_em        TIMESTAMPTZ NOT NULL,
      concluiu_em     TIMESTAMPTZ,
      status          TEXT NOT NULL DEFAULT 'dentro_prazo',
      alertas_enviados INTEGER DEFAULT 0
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS delegacao_justificativas (
      id              SERIAL PRIMARY KEY,
      delegacao_id    INTEGER NOT NULL,
      member_id       INTEGER REFERENCES team_members(id),
      motivo          TEXT NOT NULL,
      nova_prazo_em   TIMESTAMPTZ,
      aprovado_por    INTEGER REFERENCES team_members(id),
      aprovado_em     TIMESTAMPTZ,
      status          TEXT DEFAULT 'pendente',
      criado_em       TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS delegacao_escalations (
      id                SERIAL PRIMARY KEY,
      delegacao_id      INTEGER NOT NULL,
      escalado_de_id    INTEGER REFERENCES team_members(id),
      escalado_para_id  INTEGER REFERENCES team_members(id),
      motivo            TEXT,
      criado_em         TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS commission_events (
      id               SERIAL PRIMARY KEY,
      member_id        INTEGER REFERENCES team_members(id),
      delegacao_id     INTEGER,
      tipo             TEXT NOT NULL,
      valor_centavos   INTEGER NOT NULL,
      motivo           TEXT,
      criado_em        TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS disciplinary_events (
      id             SERIAL PRIMARY KEY,
      member_id      INTEGER REFERENCES team_members(id),
      tipo           TEXT NOT NULL,
      motivo         TEXT NOT NULL,
      delegacao_id   INTEGER,
      registrado_por INTEGER,
      criado_em      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Tabela de aliases de e-mail operacional (RBAC: e-mail = cargo, não pessoa)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS team_email_aliases (
      id             SERIAL PRIMARY KEY,
      email          TEXT NOT NULL UNIQUE,
      cargo_codigo   TEXT NOT NULL,
      cargo_label    TEXT NOT NULL,
      modo           TEXT NOT NULL DEFAULT 'local',
      hierarquia     TEXT NOT NULL DEFAULT 'alpha',
      clinica        TEXT NOT NULL DEFAULT 'padua',
      is_trello_main BOOLEAN DEFAULT false,
      member_id      INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
      status         TEXT NOT NULL DEFAULT 'vago',
      observacoes    TEXT,
      criado_em      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Seed de posições padrão
  await db.execute(sql`
    INSERT INTO team_positions (nome, codigo, nivel, cor_hex, sla_horas, pode_criar_demandas)
    VALUES
      ('CEO / Fundador',          'ceo',          4, '#c2a05a', 2,  true),
      ('Médico Titular',          'medico_01',    3, '#3D7A7A', 4,  true),
      ('Médico Suporte',          'medico_02',    3, '#3D7A7A', 8,  false),
      ('Enfermeira Coordenadora', 'enfermeira_01',2, '#45B8CC', 12, true),
      ('Enfermeira Operacional',  'enfermeira_02',2, '#45B8CC', 24, false),
      ('Administrativo Sênior',   'adm_01',       2, '#647c97', 12, true),
      ('Administrativo',          'adm_02',       1, '#647c97', 24, false),
      ('Financeiro Sênior',       'financeiro_01',2, '#8b7355', 12, true),
      ('Financeiro',              'financeiro_02',1, '#8b7355', 24, false),
      ('Agente IA (Claude)',       'agente_ia',   2, '#7c3aed', 1,  true)
    ON CONFLICT (codigo) DO NOTHING
  `);

  // ── process_responsibilities (Matriz RACI — quem é dono de cada processo/entrega) ──
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS process_responsibilities (
      id            SERIAL PRIMARY KEY,
      processo      TEXT NOT NULL UNIQUE,
      categoria     TEXT NOT NULL DEFAULT 'operacional',
      responsavel   TEXT NOT NULL DEFAULT '',
      aprovador     TEXT NOT NULL DEFAULT '',
      consultados   TEXT[] DEFAULT '{}',
      informados    TEXT[] DEFAULT '{}',
      ativo         BOOLEAN DEFAULT true,
      criado_em     TIMESTAMPTZ DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    INSERT INTO process_responsibilities (processo, categoria, responsavel, aprovador, consultados, informados) VALUES
      ('Gerar RAS Assinado',        'clinico',        'enfermeira_01','medico_01',    '{}',                      '{adm_01}'),
      ('Aprovar Protocolo',         'clinico',        'medico_01',    'ceo',          '{enfermeira_01}',         '{adm_01,financeiro_01}'),
      ('Lançar Protocolo',          'clinico',        'adm_01',       'medico_01',    '{enfermeira_01}',         '{financeiro_01}'),
      ('Emitir Nota Fiscal',        'financeiro',     'financeiro_02','financeiro_01','{}',                      '{adm_01}'),
      ('Cobrar Pagamento',          'financeiro',     'financeiro_01','ceo',          '{}',                      '{adm_01}'),
      ('Agendar Sessão',            'operacional',    'adm_02',       'adm_01',       '{enfermeira_01}',         '{medico_01}'),
      ('Enviar Lembrete WhatsApp',  'operacional',    'adm_02',       'adm_01',       '{}',                      '{}'),
      ('Avaliar Enfermagem',        'qualidade',      'medico_02',    'medico_01',    '{enfermeira_01}',         '{ceo}'),
      ('Conferir Trabalho Remoto',  'qualidade',      'adm_01',       'ceo',          '{medico_01}',             '{}'),
      ('Criar Pasta Drive',         'administrativo', 'adm_01',       'adm_01',       '{}',                      '{medico_01}'),
      ('Responder Ouvidoria',       'qualidade',      'adm_01',       'ceo',          '{}',                      '{medico_01}'),
      ('Enviar E-mail Pós-Sessão',  'operacional',    'adm_02',       'adm_01',       '{medico_01}',             '{}'),
      ('Revisão Mensal de Estoque', 'operacional',    'adm_01',       'medico_01',    '{financeiro_01}',         '{ceo}')
    ON CONFLICT (processo) DO NOTHING
  `);

  // ── work_reviews (Conferência de entregas de trabalho remoto) ───────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS work_reviews (
      id                SERIAL PRIMARY KEY,
      member_id         INTEGER REFERENCES team_members(id),
      demanda_id        INTEGER REFERENCES delegacoes(id),
      entrega_descricao TEXT NOT NULL,
      arquivos_links    TEXT,
      data_entrega      TIMESTAMPTZ DEFAULT NOW(),
      status            TEXT NOT NULL DEFAULT 'pendente',
      notas_revisao     TEXT,
      revisado_por      TEXT,
      revisado_em       TIMESTAMPTZ,
      criado_em         TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── work_ratings (Classificação da qualidade do trabalho) ──────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS work_ratings (
      id           SERIAL PRIMARY KEY,
      review_id    INTEGER REFERENCES work_reviews(id),
      member_id    INTEGER REFERENCES team_members(id),
      nota         INTEGER NOT NULL CHECK (nota BETWEEN 1 AND 5),
      qualidade    INTEGER CHECK (qualidade BETWEEN 1 AND 5),
      prazo        INTEGER CHECK (prazo BETWEEN 1 AND 5),
      comunicacao  INTEGER CHECK (comunicacao BETWEEN 1 AND 5),
      proatividade INTEGER CHECK (proatividade BETWEEN 1 AND 5),
      comentario   TEXT,
      avaliado_por TEXT,
      criado_em    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Seed de aliases de e-mail — padrão PAWARDS RBAC (Clínica Padua)
  await db.execute(sql`
    INSERT INTO team_email_aliases
      (email, cargo_codigo, cargo_label, modo, hierarquia, clinica, is_trello_main, status, observacoes)
    VALUES
      ('trello.padua@pawards.com.br',
        'sistema','Integração Trello (Board)','local','alpha','padua',
        true,'ativo','E-mail raiz do board Trello. Cria cards via API. Propriedade permanente da empresa.'),

      ('gestao.local.alpha.padua@pawards.com.br',
        'ceo','CEO / Fundador','local','alpha','padua',
        false,'ativo',NULL),

      ('medico.local.alpha.padua@pawards.com.br',
        'medico_01','Médico Titular','local','alpha','padua',
        false,'ativo',NULL),
      ('medico.local.beta.padua@pawards.com.br',
        'medico_02','Médico Suporte','local','beta','padua',
        false,'vago',NULL),
      ('medico.remote.alpha.padua@pawards.com.br',
        'medico_01','Médico Remoto','remote','alpha','padua',
        false,'reservado','Reservado para teleconsulta futura'),

      ('enfermagem.local.alpha.padua@pawards.com.br',
        'enfermeira_01','Enfermeira Coordenadora','local','alpha','padua',
        false,'ativo',NULL),
      ('enfermagem.local.beta.padua@pawards.com.br',
        'enfermeira_02','Enfermeira Operacional','local','beta','padua',
        false,'vago',NULL),
      ('enfermagem.remote.alpha.padua@pawards.com.br',
        'enfermeira_01','Enfermagem Remota','remote','alpha','padua',
        false,'reservado','Reservado para acompanhamento domiciliar remoto'),

      ('administrativo.local.alpha.padua@pawards.com.br',
        'adm_01','Administrativo Sênior','local','alpha','padua',
        false,'ativo',NULL),
      ('administrativo.local.beta.padua@pawards.com.br',
        'adm_02','Administrativo','local','beta','padua',
        false,'vago',NULL),
      ('administrativo.remote.alpha.padua@pawards.com.br',
        'adm_01','Administrativo Remoto','remote','alpha','padua',
        false,'reservado','Reservado para operação remota / home office'),

      ('financeiro.local.alpha.padua@pawards.com.br',
        'financeiro_01','Financeiro Sênior','local','alpha','padua',
        false,'ativo',NULL),
      ('financeiro.local.beta.padua@pawards.com.br',
        'financeiro_02','Financeiro','local','beta','padua',
        false,'vago',NULL),

      ('supervisao.local.alpha.padua@pawards.com.br',
        'supervisao','Supervisão Clínica','local','alpha','padua',
        false,'reservado','Reservado para supervisor de qualidade'),
      ('consultoria.remote.alpha.padua@pawards.com.br',
        'consultoria','Consultoria Remota','remote','alpha','padua',
        false,'reservado','Reservado para consultores externos e parceiros'),
      ('ouvidoria.local.alpha.padua@pawards.com.br',
        'ouvidoria','Ouvidoria / Qualidade','local','alpha','padua',
        false,'reservado','Canal de qualidade, ouvidoria e compliance')
    ON CONFLICT (email) DO NOTHING
  `);
}

initTables().catch(err => logger.error({ err }, "PADTEAM: falha ao inicializar tabelas"));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rows<T>(result: { rows: T[] }): T[] {
  return result.rows;
}

// ─── Posições ────────────────────────────────────────────────────────────────

router.get("/padteam/positions", async (_req, res): Promise<void> => {
  const r = await db.execute(sql`SELECT * FROM team_positions ORDER BY nivel DESC, nome`);
  res.json(rows(r));
});

router.post("/padteam/positions", async (req, res): Promise<void> => {
  const { nome, codigo, descricao, cor_hex, nivel, sla_horas, pode_receber_demandas, pode_criar_demandas } = req.body;
  if (!nome || !codigo) { res.status(400).json({ error: "nome e codigo obrigatórios" }); return; }
  const r = await db.execute(sql`
    INSERT INTO team_positions (nome, codigo, descricao, cor_hex, nivel, sla_horas, pode_receber_demandas, pode_criar_demandas)
    VALUES (${nome}, ${codigo}, ${descricao ?? null}, ${cor_hex ?? '#3D7A7A'}, ${nivel ?? 1}, ${sla_horas ?? 24}, ${pode_receber_demandas ?? true}, ${pode_criar_demandas ?? false})
    RETURNING *
  `);
  res.status(201).json(rows(r)[0]);
});

// ─── Membros ─────────────────────────────────────────────────────────────────

router.get("/padteam/members", async (_req, res): Promise<void> => {
  const r = await db.execute(sql`
    SELECT m.*, p.nome AS cargo_nome, p.cor_hex AS cargo_cor, p.nivel AS cargo_nivel
    FROM team_members m
    LEFT JOIN team_positions p ON p.id = m.cargo_id
    ORDER BY p.nivel DESC NULLS LAST, m.nome
  `);
  res.json(rows(r));
});

router.post("/padteam/members", async (req, res): Promise<void> => {
  const { nome, email, telefone, cargo_id, tipo, especialidades, max_demandas_simultaneas, professional_id, observacoes } = req.body;
  if (!nome) { res.status(400).json({ error: "nome obrigatório" }); return; }
  const r = await db.execute(sql`
    INSERT INTO team_members (nome, email, telefone, cargo_id, tipo, especialidades, max_demandas_simultaneas, professional_id, observacoes)
    VALUES (${nome}, ${email ?? null}, ${telefone ?? null}, ${cargo_id ?? null}, ${tipo ?? 'humano'},
            ${especialidades ?? null}, ${max_demandas_simultaneas ?? 5}, ${professional_id ?? null}, ${observacoes ?? null})
    RETURNING *
  `);
  res.status(201).json(rows(r)[0]);
});

router.patch("/padteam/members/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const { nome, email, telefone, cargo_id, status, max_demandas_simultaneas, observacoes } = req.body;
  const r = await db.execute(sql`
    UPDATE team_members SET
      nome   = COALESCE(${nome ?? null}, nome),
      email  = COALESCE(${email ?? null}, email),
      telefone = COALESCE(${telefone ?? null}, telefone),
      cargo_id = COALESCE(${cargo_id ?? null}, cargo_id),
      status = COALESCE(${status ?? null}, status),
      max_demandas_simultaneas = COALESCE(${max_demandas_simultaneas ?? null}, max_demandas_simultaneas),
      observacoes = COALESCE(${observacoes ?? null}, observacoes)
    WHERE id = ${id}
    RETURNING *
  `);
  if (!rows(r).length) { res.status(404).json({ error: "Membro não encontrado" }); return; }
  res.json(rows(r)[0]);
});

// ─── Demandas (delegacoes) ────────────────────────────────────────────────────

router.get("/padteam/demandas", async (req, res): Promise<void> => {
  const { status, prioridade, assigned_role, member_id, client_id, tipo } = req.query as Record<string, string>;

  let where = "WHERE 1=1";
  const params: (string | number | null)[] = [];

  if (status)        { where += ` AND d.status = $${params.push(status)}`; }
  if (prioridade)    { where += ` AND d.prioridade = $${params.push(prioridade)}`; }
  if (assigned_role) { where += ` AND d.assigned_role = $${params.push(assigned_role)}`; }
  if (member_id)     { where += ` AND d.assigned_member_id = $${params.push(parseInt(member_id))}`; }
  if (client_id)     { where += ` AND d.client_id = $${params.push(parseInt(client_id))}`; }
  if (tipo)          { where += ` AND d.tipo = $${params.push(tipo)}`; }

  const r = await db.execute(sql.raw(`
    SELECT d.*,
      m.nome AS member_nome,
      p.nome AS cargo_nome,
      p.cor_hex AS cargo_cor,
      c.name AS client_nome
    FROM delegacoes d
    LEFT JOIN team_members m ON m.id = d.assigned_member_id
    LEFT JOIN team_positions p ON p.id = m.cargo_id
    LEFT JOIN clients c ON c.id = d.client_id
    ${where}
    ORDER BY
      CASE d.prioridade WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      d.criado_em DESC
    LIMIT 200
  `));
  res.json({ items: rows(r) });
});

router.get("/padteam/demandas/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const r = await db.execute(sql`
    SELECT d.*,
      m.nome AS member_nome,
      p.nome AS cargo_nome,
      c.name AS client_nome
    FROM delegacoes d
    LEFT JOIN team_members m ON m.id = d.assigned_member_id
    LEFT JOIN team_positions p ON p.id = m.cargo_id
    LEFT JOIN clients c ON c.id = d.client_id
    WHERE d.id = ${id}
  `);
  if (!rows(r).length) { res.status(404).json({ error: "Demanda não encontrada" }); return; }

  const sla = await db.execute(sql`SELECT * FROM sla_monitoring WHERE delegacao_id = ${id} ORDER BY id DESC LIMIT 1`);
  const justs = await db.execute(sql`SELECT * FROM delegacao_justificativas WHERE delegacao_id = ${id} ORDER BY criado_em DESC`);
  const esc = await db.execute(sql`SELECT * FROM delegacao_escalations WHERE delegacao_id = ${id} ORDER BY criado_em`);

  res.json({ ...rows(r)[0] as object, sla: rows(sla)[0] ?? null, justificativas: rows(justs), escalamentos: rows(esc) });
});

router.post("/padteam/demandas", async (req, res): Promise<void> => {
  const {
    titulo, descricao, tipo, origem, prioridade, assigned_role,
    assigned_member_id, client_id, protocol_id, prazo_horas, notas, criado_por,
  } = req.body;
  if (!titulo) { res.status(400).json({ error: "titulo obrigatório" }); return; }

  const horas = parseInt(prazo_horas ?? "24");
  const prazoEm = new Date(Date.now() + horas * 3_600_000).toISOString();

  const r = await db.execute(sql`
    INSERT INTO delegacoes
      (titulo, descricao, tipo, origem, prioridade, assigned_role, assigned_member_id,
       client_id, protocol_id, prazo_horas, prazo_em, notas, criado_por)
    VALUES
      (${titulo}, ${descricao ?? null}, ${tipo ?? 'manual'}, ${origem ?? null},
       ${prioridade ?? 'normal'}, ${assigned_role ?? null}, ${assigned_member_id ?? null},
       ${client_id ?? null}, ${protocol_id ?? null}, ${horas}, ${prazoEm},
       ${notas ?? null}, ${criado_por ?? null})
    RETURNING *
  `);
  const demanda = rows(r)[0] as Record<string, unknown>;

  // Cria registro de SLA
  await db.execute(sql`
    INSERT INTO sla_monitoring (delegacao_id, sla_horas, prazo_em)
    VALUES (${demanda.id as number}, ${horas}, ${prazoEm})
  `);

  res.status(201).json(demanda);
});

router.patch("/padteam/demandas/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const { titulo, descricao, status, prioridade, assigned_role, assigned_member_id, notas } = req.body;

  const r = await db.execute(sql`
    UPDATE delegacoes SET
      titulo              = COALESCE(${titulo ?? null}, titulo),
      descricao           = COALESCE(${descricao ?? null}, descricao),
      status              = COALESCE(${status ?? null}, status),
      prioridade          = COALESCE(${prioridade ?? null}, prioridade),
      assigned_role       = COALESCE(${assigned_role ?? null}, assigned_role),
      assigned_member_id  = COALESCE(${assigned_member_id ?? null}, assigned_member_id),
      notas               = COALESCE(${notas ?? null}, notas),
      atualizado_em       = NOW()
    WHERE id = ${id}
    RETURNING *
  `);
  if (!rows(r).length) { res.status(404).json({ error: "Demanda não encontrada" }); return; }
  res.json(rows(r)[0]);
});

router.post("/padteam/demandas/:id/concluir", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const { resultado, concluido_por } = req.body;

  const now = new Date().toISOString();
  const r = await db.execute(sql`
    UPDATE delegacoes SET status = 'concluido', concluido_em = ${now}, concluido_por = ${concluido_por ?? null}, resultado = ${resultado ?? null}, atualizado_em = NOW()
    WHERE id = ${id}
    RETURNING *
  `);
  if (!rows(r).length) { res.status(404).json({ error: "Demanda não encontrada" }); return; }

  await db.execute(sql`
    UPDATE sla_monitoring SET concluiu_em = ${now}, status = 'concluido'
    WHERE delegacao_id = ${id} AND concluiu_em IS NULL
  `);

  res.json(rows(r)[0]);
});

router.post("/padteam/demandas/:id/escalar", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const { escalado_para_id, motivo } = req.body;

  const dem = await db.execute(sql`SELECT * FROM delegacoes WHERE id = ${id}`);
  if (!rows(dem).length) { res.status(404).json({ error: "Demanda não encontrada" }); return; }
  const d = rows(dem)[0] as Record<string, unknown>;

  await db.execute(sql`
    INSERT INTO delegacao_escalations (delegacao_id, escalado_de_id, escalado_para_id, motivo)
    VALUES (${id}, ${d.assigned_member_id as number | null}, ${escalado_para_id}, ${motivo ?? null})
  `);

  await db.execute(sql`
    UPDATE delegacoes SET status = 'escalado', assigned_member_id = ${escalado_para_id}, atualizado_em = NOW()
    WHERE id = ${id}
  `);

  res.json({ ok: true });
});

router.post("/padteam/demandas/:id/justificar", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const { member_id, motivo, nova_prazo_em } = req.body;
  if (!motivo) { res.status(400).json({ error: "motivo obrigatório" }); return; }

  const r = await db.execute(sql`
    INSERT INTO delegacao_justificativas (delegacao_id, member_id, motivo, nova_prazo_em)
    VALUES (${id}, ${member_id ?? null}, ${motivo}, ${nova_prazo_em ?? null})
    RETURNING *
  `);
  res.status(201).json(rows(r)[0]);
});

// ─── Geração automática por gatilho ──────────────────────────────────────────

router.post("/padteam/gerar-automatica", async (req, res): Promise<void> => {
  const { gatilho, client_id, protocol_id, dados_extras } = req.body;
  if (!gatilho) { res.status(400).json({ error: "gatilho obrigatório" }); return; }

  const templates: Record<string, { titulo: string; assigned_role: string; prioridade: string; prazo_horas: number; tipo: string }> = {
    welcome_adm:     { titulo: "Boas-vindas Administrativo",    assigned_role: "adm_01",       prioridade: "alta",    prazo_horas: 4,  tipo: "auto_protocolo" },
    welcome_enf:     { titulo: "Boas-vindas Enfermagem",        assigned_role: "enfermeira_01",prioridade: "alta",    prazo_horas: 4,  tipo: "auto_protocolo" },
    followup:        { titulo: "Follow-up de Protocolo",        assigned_role: "enfermeira_01",prioridade: "normal",  prazo_horas: 24, tipo: "auto_protocolo" },
    alert_red:       { titulo: "Alerta Vermelho — Avaliação",   assigned_role: "medico_02",    prioridade: "urgente", prazo_horas: 2,  tipo: "auto_protocolo" },
    alert_yellow:    { titulo: "Alerta Amarelo — Avaliação",    assigned_role: "enfermeira_02",prioridade: "alta",    prazo_horas: 8,  tipo: "auto_protocolo" },
    payment_nf:      { titulo: "Pagamento — Emitir NF",         assigned_role: "financeiro_02",prioridade: "normal",  prazo_horas: 48, tipo: "auto_pagamento"  },
    monthly_review:  { titulo: "Revisão Mensal do Protocolo",   assigned_role: "medico_02",    prioridade: "normal",  prazo_horas: 72, tipo: "auto_protocolo" },
    exam_reminder:   { titulo: "Lembrar Exames — Antepenúltima",assigned_role: "enfermeira_02",prioridade: "alta",    prazo_horas: 24, tipo: "auto_protocolo" },
    final_session:   { titulo: "Última Sessão — Encerrar",      assigned_role: "adm_02",       prioridade: "alta",    prazo_horas: 12, tipo: "auto_protocolo" },
    agent_task:      { titulo: "Tarefa para Agente IA",         assigned_role: "agente_ia",    prioridade: "normal",  prazo_horas: 1,  tipo: "auto_agente"    },
  };

  const t = templates[gatilho];
  if (!t) { res.status(400).json({ error: `Gatilho desconhecido: ${gatilho}` }); return; }

  const titulo = dados_extras?.titulo ?? t.titulo;
  const descricao = dados_extras?.descricao ?? null;
  const horas = t.prazo_horas;
  const prazoEm = new Date(Date.now() + horas * 3_600_000).toISOString();

  const r = await db.execute(sql`
    INSERT INTO delegacoes (titulo, descricao, tipo, origem, prioridade, assigned_role, client_id, protocol_id, prazo_horas, prazo_em)
    VALUES (${titulo}, ${descricao}, ${t.tipo}, ${`gatilho:${gatilho}`}, ${t.prioridade}, ${t.assigned_role}, ${client_id ?? null}, ${protocol_id ?? null}, ${horas}, ${prazoEm})
    RETURNING *
  `);
  const demanda = rows(r)[0] as Record<string, unknown>;

  await db.execute(sql`
    INSERT INTO sla_monitoring (delegacao_id, sla_horas, prazo_em)
    VALUES (${demanda.id as number}, ${horas}, ${prazoEm})
  `);

  res.status(201).json(demanda);
});

// ─── Dashboard KPIs ──────────────────────────────────────────────────────────

router.get("/padteam/dashboard", async (_req, res): Promise<void> => {
  const [total, abertas, urgentes, vencidas, concluidas] = await Promise.all([
    db.execute(sql`SELECT COUNT(*)::int AS n FROM delegacoes`),
    db.execute(sql`SELECT COUNT(*)::int AS n FROM delegacoes WHERE status IN ('aberto','em_andamento','escalado')`),
    db.execute(sql`SELECT COUNT(*)::int AS n FROM delegacoes WHERE prioridade = 'urgente' AND status IN ('aberto','em_andamento')`),
    db.execute(sql`SELECT COUNT(*)::int AS n FROM delegacoes WHERE prazo_em < NOW() AND status IN ('aberto','em_andamento','escalado')`),
    db.execute(sql`SELECT COUNT(*)::int AS n FROM delegacoes WHERE status = 'concluido' AND concluido_em > NOW() - INTERVAL '30 days'`),
  ]);

  const porRole = await db.execute(sql`
    SELECT assigned_role, COUNT(*)::int AS total
    FROM delegacoes WHERE status IN ('aberto','em_andamento')
    GROUP BY assigned_role ORDER BY total DESC
  `);

  const recentes = await db.execute(sql`
    SELECT d.id, d.titulo, d.status, d.prioridade, d.assigned_role, d.criado_em, m.nome AS member_nome
    FROM delegacoes d
    LEFT JOIN team_members m ON m.id = d.assigned_member_id
    ORDER BY d.criado_em DESC LIMIT 5
  `);

  res.json({
    total:     (rows(total)[0] as Record<string,number>)?.n ?? 0,
    abertas:   (rows(abertas)[0] as Record<string,number>)?.n ?? 0,
    urgentes:  (rows(urgentes)[0] as Record<string,number>)?.n ?? 0,
    vencidas:  (rows(vencidas)[0] as Record<string,number>)?.n ?? 0,
    concluidas30d: (rows(concluidas)[0] as Record<string,number>)?.n ?? 0,
    por_role:  rows(porRole),
    recentes:  rows(recentes),
  });
});

// ─── Scoring de operadores ────────────────────────────────────────────────────

router.get("/padteam/scoring", async (_req, res): Promise<void> => {
  const r = await db.execute(sql`
    SELECT
      m.id,
      m.nome,
      p.nome AS cargo,
      p.cor_hex,
      COUNT(d.id) FILTER (WHERE d.assigned_member_id = m.id) AS total_atribuidas,
      COUNT(d.id) FILTER (WHERE d.assigned_member_id = m.id AND d.status = 'concluido') AS concluidas,
      COUNT(d.id) FILTER (WHERE d.assigned_member_id = m.id AND d.status = 'concluido' AND d.concluido_em <= d.prazo_em) AS no_prazo,
      ROUND(
        100.0 * COUNT(d.id) FILTER (WHERE d.assigned_member_id = m.id AND d.status = 'concluido')
        / NULLIF(COUNT(d.id) FILTER (WHERE d.assigned_member_id = m.id), 0)
      ) AS taxa_resolucao
    FROM team_members m
    LEFT JOIN team_positions p ON p.id = m.cargo_id
    LEFT JOIN delegacoes d ON d.assigned_member_id = m.id
    WHERE m.status = 'ativo'
    GROUP BY m.id, m.nome, p.nome, p.cor_hex
    ORDER BY taxa_resolucao DESC NULLS LAST, concluidas DESC
  `);
  res.json(rows(r));
});

// ─── E-mail Aliases (RBAC: e-mail = cargo, não pessoa) ───────────────────────

router.get("/padteam/email-aliases", async (_req, res): Promise<void> => {
  const r = await db.execute(sql`
    SELECT ea.*, m.nome AS member_nome, m.status AS member_status
    FROM team_email_aliases ea
    LEFT JOIN team_members m ON m.id = ea.member_id
    ORDER BY ea.is_trello_main DESC, ea.cargo_codigo, ea.hierarquia
  `);
  res.json(rows(r));
});

router.patch("/padteam/email-aliases/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const { member_id, status, observacoes } = req.body;
  const novoStatus = status ?? (member_id !== undefined ? (member_id ? "ativo" : "vago") : undefined);
  const r = await db.execute(sql`
    UPDATE team_email_aliases SET
      member_id   = CASE WHEN ${member_id !== undefined} THEN ${member_id ?? null}::integer ELSE member_id END,
      status      = COALESCE(${novoStatus ?? null}, status),
      observacoes = COALESCE(${observacoes ?? null}, observacoes)
    WHERE id = ${id}
    RETURNING *
  `);
  if (!rows(r).length) { res.status(404).json({ error: "Alias não encontrado" }); return; }
  res.json(rows(r)[0]);
});

// ─── Matriz RACI — Responsabilidades de Processo ──────────────────────────────

router.get("/padteam/process-responsibilities", async (_req, res): Promise<void> => {
  const r = await db.execute(sql`SELECT * FROM process_responsibilities ORDER BY categoria, processo`);
  res.json(rows(r));
});

router.patch("/padteam/process-responsibilities/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const { responsavel, aprovador, consultados, informados, ativo } = req.body;
  const r = await db.execute(sql`
    UPDATE process_responsibilities SET
      responsavel   = COALESCE(${responsavel ?? null}, responsavel),
      aprovador     = COALESCE(${aprovador ?? null}, aprovador),
      consultados   = COALESCE(${consultados ?? null}::text[], consultados),
      informados    = COALESCE(${informados ?? null}::text[], informados),
      ativo         = COALESCE(${ativo ?? null}, ativo),
      atualizado_em = NOW()
    WHERE id = ${id}
    RETURNING *
  `);
  if (!rows(r).length) { res.status(404).json({ error: "Processo não encontrado" }); return; }
  res.json(rows(r)[0]);
});

// ─── Conferência de Trabalho Remoto ──────────────────────────────────────────

router.get("/padteam/work-reviews", async (req, res): Promise<void> => {
  const { member_id, status } = req.query as Record<string, string>;
  const r = await db.execute(sql.raw(`
    SELECT wr.*, m.nome AS member_nome, p.nome AS cargo_nome, p.cor_hex AS cargo_cor,
           d.titulo AS demanda_titulo
    FROM work_reviews wr
    LEFT JOIN team_members m  ON m.id = wr.member_id
    LEFT JOIN team_positions p ON p.id = m.cargo_id
    LEFT JOIN delegacoes d    ON d.id = wr.demanda_id
    ${member_id ? `WHERE wr.member_id = ${parseInt(member_id)}` : ""}
    ${status && !member_id ? `WHERE wr.status = '${status}'` : status ? `AND wr.status = '${status}'` : ""}
    ORDER BY wr.criado_em DESC LIMIT 100
  `));
  res.json(rows(r));
});

router.post("/padteam/work-reviews", async (req, res): Promise<void> => {
  const { member_id, demanda_id, entrega_descricao, arquivos_links } = req.body;
  if (!member_id || !entrega_descricao) {
    res.status(400).json({ error: "member_id e entrega_descricao obrigatórios" }); return;
  }
  const r = await db.execute(sql`
    INSERT INTO work_reviews (member_id, demanda_id, entrega_descricao, arquivos_links)
    VALUES (${member_id}, ${demanda_id ?? null}, ${entrega_descricao}, ${arquivos_links ?? null})
    RETURNING *
  `);
  res.status(201).json(rows(r)[0]);
});

router.patch("/padteam/work-reviews/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const { status, notas_revisao, revisado_por } = req.body;
  const now = new Date().toISOString();
  const r = await db.execute(sql`
    UPDATE work_reviews SET
      status        = COALESCE(${status ?? null}, status),
      notas_revisao = COALESCE(${notas_revisao ?? null}, notas_revisao),
      revisado_por  = COALESCE(${revisado_por ?? null}, revisado_por),
      revisado_em   = CASE WHEN ${status ?? null} IN ('aprovado','reprovado') THEN ${now}::timestamptz ELSE revisado_em END
    WHERE id = ${id}
    RETURNING *
  `);
  if (!rows(r).length) { res.status(404).json({ error: "Review não encontrado" }); return; }
  res.json(rows(r)[0]);
});

// ─── Classificação (Rating) de Trabalho ──────────────────────────────────────

router.post("/padteam/work-ratings", async (req, res): Promise<void> => {
  const { review_id, member_id, nota, qualidade, prazo, comunicacao, proatividade, comentario, avaliado_por } = req.body;
  if (!review_id || !member_id || !nota) {
    res.status(400).json({ error: "review_id, member_id e nota obrigatórios" }); return;
  }
  const r = await db.execute(sql`
    INSERT INTO work_ratings (review_id, member_id, nota, qualidade, prazo, comunicacao, proatividade, comentario, avaliado_por)
    VALUES (${review_id}, ${member_id}, ${nota}, ${qualidade ?? null}, ${prazo ?? null},
            ${comunicacao ?? null}, ${proatividade ?? null}, ${comentario ?? null}, ${avaliado_por ?? null})
    RETURNING *
  `);
  res.status(201).json(rows(r)[0]);
});

router.get("/padteam/work-ratings/summary", async (_req, res): Promise<void> => {
  const r = await db.execute(sql`
    SELECT
      m.id AS member_id, m.nome, p.nome AS cargo, p.cor_hex,
      COUNT(wr.id)::int AS total_avaliacoes,
      ROUND(AVG(wr.nota), 1)         AS media_geral,
      ROUND(AVG(wr.qualidade), 1)    AS media_qualidade,
      ROUND(AVG(wr.prazo), 1)        AS media_prazo,
      ROUND(AVG(wr.comunicacao), 1)  AS media_comunicacao,
      ROUND(AVG(wr.proatividade), 1) AS media_proatividade
    FROM team_members m
    LEFT JOIN team_positions p  ON p.id = m.cargo_id
    LEFT JOIN work_ratings wr   ON wr.member_id = m.id
    WHERE m.status = 'ativo'
    GROUP BY m.id, m.nome, p.nome, p.cor_hex
    ORDER BY media_geral DESC NULLS LAST
  `);
  res.json(rows(r));
});

// ─── Trello Webhook (eventos do Trello real → nosso sistema) ─────────────────

router.post("/padteam/trello-webhook", async (req, res): Promise<void> => {
  // Trello envia HEAD para verificar o webhook — sempre responder 200
  res.status(200).json({ ok: true });

  const action = req.body?.action;
  if (!action) return;

  const { type, data } = action;
  const cardId = data?.card?.id;

  if (!cardId) return;

  try {
    // Buscar demanda vinculada ao card Trello
    const dem = await db.execute(sql`SELECT * FROM delegacoes WHERE trello_card_id = ${cardId}`);
    if (!rows(dem).length) return;

    const d = rows(dem)[0] as Record<string, unknown>;
    const demandaId = d.id as number;

    // Mapear ações do Trello para nosso sistema
    if (type === "updateCard") {
      const listAfter = data?.listAfter;
      if (listAfter) {
        const nomeLista = String(listAfter.name ?? "").toLowerCase();
        let novoStatus = "";
        if (nomeLista.includes("conclu") || nomeLista.includes("done") || nomeLista.includes("feito")) {
          novoStatus = "concluido";
        } else if (nomeLista.includes("andamento") || nomeLista.includes("doing") || nomeLista.includes("progress")) {
          novoStatus = "em_andamento";
        } else if (nomeLista.includes("aguard") || nomeLista.includes("waiting") || nomeLista.includes("blocked")) {
          novoStatus = "aguardando";
        }
        if (novoStatus) {
          await db.execute(sql`UPDATE delegacoes SET status = ${novoStatus}, atualizado_em = NOW() WHERE id = ${demandaId}`);
          logger.info({ demandaId, novoStatus, trelloCard: cardId }, "PADTEAM webhook: status atualizado pelo Trello");
        }
      }
    } else if (type === "commentCard") {
      const texto = data?.action?.data?.text ?? "";
      if (texto) {
        await db.execute(sql`
          UPDATE delegacoes SET notas = COALESCE(notas, '') || '\n[Trello] ' || ${String(texto)}, atualizado_em = NOW()
          WHERE id = ${demandaId}
        `);
      }
    }
  } catch (err) {
    logger.error({ err: (err as Error).message, cardId }, "PADTEAM webhook: erro ao processar evento Trello");
  }
});

router.head("/padteam/trello-webhook", (_req, res): void => {
  res.status(200).end();
});

// ─── Sync Trello ─────────────────────────────────────────────────────────────

router.post("/padteam/sync-trello", async (req, res): Promise<void> => {
  const { demanda_id } = req.body;
  if (!demanda_id) { res.status(400).json({ error: "demanda_id obrigatório" }); return; }

  let trelloAvailable = !!(process.env.TRELLO_API_KEY && process.env.TRELLO_TOKEN && process.env.TRELLO_BOARD_ID);
  if (!trelloAvailable) {
    res.status(400).json({ error: "Trello não configurado. Defina TRELLO_API_KEY, TRELLO_TOKEN e TRELLO_BOARD_ID." });
    return;
  }

  const dem = await db.execute(sql`SELECT * FROM delegacoes WHERE id = ${parseInt(demanda_id)}`);
  if (!rows(dem).length) { res.status(404).json({ error: "Demanda não encontrada" }); return; }

  const { createCard, listLists } = await import("../lib/trello");
  const d = rows(dem)[0] as Record<string, unknown>;

  const lists = await listLists();
  const targetList = lists.find((l) => l.name.toLowerCase().includes("aberto") || l.name.toLowerCase().includes("to do"))
    ?? lists[0];

  if (!targetList) { res.status(400).json({ error: "Nenhuma lista encontrada no board Trello" }); return; }

  const card = await createCard({
    listId: targetList.id,
    name: `[${String(d.prioridade).toUpperCase()}] ${d.titulo}`,
    desc: [d.descricao, d.notas, `Origem: ${d.origem ?? "manual"}`].filter(Boolean).join("\n\n"),
    due: d.prazo_em ? String(d.prazo_em) : undefined,
  });

  await db.execute(sql`
    UPDATE delegacoes SET trello_card_id = ${card.id}, trello_list_id = ${targetList.id}, atualizado_em = NOW()
    WHERE id = ${parseInt(demanda_id)}
  `);

  res.json({ ok: true, trello_card_id: card.id, url: card.url });
});

export default router;
