/**
 * Migração da área comercial (orçamentos, política por clínica, negociação assistida).
 *
 * Regras:
 *  - Aditiva e idempotente: pode rodar a cada partida sem apagar nada.
 *  - A configuração antiga (budget_settings id=1, global) passa a pertencer à clínica 5 (Instituto Pádua).
 *    Os orçamentos antigos também passam a pertencer à clínica 5. Nada é recalculado.
 *  - Reversível: `reverterComercial` remove SÓ o que esta migração criou e se recusa a apagar dados de outras
 *    clínicas sem `forcar: true`.
 *  - Não usa drizzle push (drift destrutivo documentado); as colunas também estão no esquema drizzle.
 */
import type { Pool } from "pg";

export const CLINICA_ORIGEM_COMERCIAL = 5;
const TRAVA = 19_872_027;

const SQL_UP = `
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS empresa_id integer;
UPDATE budgets SET empresa_id = ${CLINICA_ORIGEM_COMERCIAL} WHERE empresa_id IS NULL;
ALTER TABLE budgets ALTER COLUMN empresa_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS budgets_empresa_idx ON budgets (empresa_id, client_id);

ALTER TABLE budget_settings ADD COLUMN IF NOT EXISTS empresa_id integer;
UPDATE budget_settings SET empresa_id = ${CLINICA_ORIGEM_COMERCIAL} WHERE id = 1 AND empresa_id IS NULL;
ALTER TABLE budget_settings ADD COLUMN IF NOT EXISTS desconto_excepcional_avista_pct real NOT NULL DEFAULT 22;
ALTER TABLE budget_settings ADD COLUMN IF NOT EXISTS desconto_excepcional_parcelado_pct real NOT NULL DEFAULT 18;
ALTER TABLE budget_settings ADD COLUMN IF NOT EXISTS entrada_minima_excecao_pct real NOT NULL DEFAULT 70;
ALTER TABLE budget_settings ADD COLUMN IF NOT EXISTS margem_liquida_minima_pct real NOT NULL DEFAULT 20;
ALTER TABLE budget_settings ADD COLUMN IF NOT EXISTS tributos_pct real NOT NULL DEFAULT 0;
ALTER TABLE budget_settings ADD COLUMN IF NOT EXISTS negociacao_cadenciada_30min_ativa boolean NOT NULL DEFAULT false;
ALTER TABLE budget_settings ADD COLUMN IF NOT EXISTS nome_gerente_financeiro text NOT NULL DEFAULT 'Carlos';
CREATE UNIQUE INDEX IF NOT EXISTS budget_settings_empresa_uq ON budget_settings (empresa_id);
CREATE SEQUENCE IF NOT EXISTS budget_settings_id_seq START 1000;

ALTER TABLE budget_catalog ADD COLUMN IF NOT EXISTS custo_unit_cents integer;

CREATE TABLE IF NOT EXISTS budget_eventos (
  id bigserial PRIMARY KEY,
  empresa_id integer NOT NULL,
  budget_id integer NOT NULL,
  tipo text NOT NULL,
  de text,
  para text,
  usuario_id integer,
  detalhe jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS budget_eventos_orc_idx ON budget_eventos (empresa_id, budget_id, id);

CREATE TABLE IF NOT EXISTS negociacoes_comerciais (
  id bigserial PRIMARY KEY,
  empresa_id integer NOT NULL,
  cliente_id integer NOT NULL,
  budget_id integer NOT NULL,
  canal text NOT NULL CHECK (canal IN ('whatsapp','telegram')),
  contato text NOT NULL,
  estado text NOT NULL CHECK (estado IN ('cadencia_ativa','pausada','concluida','cancelada','aguardando_gerente','aprovada_gerente','recusada_gerente')),
  caminho text NOT NULL CHECK (caminho IN ('A_automatico','B_humano')),
  oferta jsonb NOT NULL,
  motivo text,
  mensagem_origem text,
  decidido_por integer,
  decidido_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS negociacoes_uma_ativa_uq ON negociacoes_comerciais (empresa_id, cliente_id, budget_id)
  WHERE estado IN ('cadencia_ativa','aguardando_gerente','aprovada_gerente');
CREATE INDEX IF NOT EXISTS negociacoes_empresa_idx ON negociacoes_comerciais (empresa_id, estado, id);

CREATE TABLE IF NOT EXISTS negotiation_cadence_jobs (
  id bigserial PRIMARY KEY,
  negociacao_id bigint NOT NULL REFERENCES negociacoes_comerciais(id),
  empresa_id integer NOT NULL,
  etapa smallint NOT NULL CHECK (etapa BETWEEN 0 AND 3),
  devido_em timestamptz NOT NULL,
  estado text NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente','enviando','enviado','pausado','cancelado','falhou')),
  enviado_em timestamptz,
  motivo text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (negociacao_id, etapa)
);
CREATE INDEX IF NOT EXISTS negotiation_cadence_jobs_devido_idx ON negotiation_cadence_jobs (estado, devido_em);
`;

const SQL_DOWN_SEGURO = `
DROP TABLE IF EXISTS negotiation_cadence_jobs;
DROP TABLE IF EXISTS negociacoes_comerciais;
DROP TABLE IF EXISTS budget_eventos;
ALTER TABLE budget_catalog DROP COLUMN IF EXISTS custo_unit_cents;
DROP INDEX IF EXISTS budget_settings_empresa_uq;
ALTER TABLE budget_settings DROP COLUMN IF EXISTS desconto_excepcional_avista_pct;
ALTER TABLE budget_settings DROP COLUMN IF EXISTS desconto_excepcional_parcelado_pct;
ALTER TABLE budget_settings DROP COLUMN IF EXISTS entrada_minima_excecao_pct;
ALTER TABLE budget_settings DROP COLUMN IF EXISTS margem_liquida_minima_pct;
ALTER TABLE budget_settings DROP COLUMN IF EXISTS tributos_pct;
ALTER TABLE budget_settings DROP COLUMN IF EXISTS negociacao_cadenciada_30min_ativa;
ALTER TABLE budget_settings DROP COLUMN IF EXISTS nome_gerente_financeiro;
ALTER TABLE budget_settings DROP COLUMN IF EXISTS empresa_id;
DROP INDEX IF EXISTS budgets_empresa_idx;
ALTER TABLE budgets ALTER COLUMN empresa_id DROP NOT NULL;
ALTER TABLE budgets DROP COLUMN IF EXISTS empresa_id;
`;

export async function migrarComercial(pool: Pool): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock($1)", [TRAVA]);
    await c.query(SQL_UP);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

/** Desfaz a migração. Recusa se houver política ou orçamento de outra clínica (perderiam o dono) e jobs de negociação. */
export async function reverterComercial(pool: Pool, opcoes: { forcar?: boolean } = {}): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock($1)", [TRAVA]);
    if (!opcoes.forcar) {
      const outras = await c.query(
        `SELECT (SELECT count(*) FROM budget_settings WHERE empresa_id IS DISTINCT FROM ${CLINICA_ORIGEM_COMERCIAL})::int AS s,
                (SELECT count(*) FROM budgets WHERE empresa_id <> ${CLINICA_ORIGEM_COMERCIAL})::int AS b,
                (SELECT count(*) FROM negociacoes_comerciais)::int AS n`);
      const r = outras.rows[0] as { s: number; b: number; n: number };
      if (r.s > 0 || r.b > 0 || r.n > 0) throw new Error("reversao_recusada_ha_dados_de_outras_clinicas_ou_negociacoes");
    }
    await c.query(SQL_DOWN_SEGURO);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

let pronta: Promise<void> | null = null;
/** Executa a migração uma vez por processo; falha não fica memorizada. */
export function garantirComercial(pool: Pool): Promise<void> {
  return (pronta ??= migrarComercial(pool).catch((e) => { pronta = null; throw e; }));
}
