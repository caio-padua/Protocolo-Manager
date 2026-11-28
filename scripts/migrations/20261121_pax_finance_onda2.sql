-- PAX FINANCE onda 2 (aditivo e idempotente). Espelho de PAX_FINANCE_DDL (api-server/src/pax-finance/schema.ts). Producao so apos aprovacao do Dr. Caio.
CREATE TABLE IF NOT EXISTS fin_entity (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES empresas(id),
    cnpj TEXT NOT NULL,
    razao_social TEXT NOT NULL,
    nome_fantasia TEXT,
    data_constituicao DATE,
    natureza_juridica TEXT,
    porte TEXT,
    capital_social_cents BIGINT CHECK (capital_social_cents IS NULL OR capital_social_cents >= 0),
    capital_integralizado BOOLEAN,
    sede JSONB NOT NULL DEFAULT '{}'::jsonb,
    cnae_principal TEXT,
    cnae_principal_descricao TEXT,
    cnaes_secundarios JSONB NOT NULL DEFAULT '[]'::jsonb,
    regime_efetivo TEXT,
    opcao_simples TEXT NOT NULL DEFAULT 'nao_verificada' CHECK (opcao_simples IN ('nao_verificada','confirmada','nao_optante')),
    inscricao_municipal TEXT,
    inscricao_estadual TEXT,
    origem_campos JSONB NOT NULL DEFAULT '{}'::jsonb,
    status_validacao TEXT NOT NULL DEFAULT 'rascunho' CHECK (status_validacao IN ('rascunho','validado')),
    validated_by INTEGER,
    validated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, cnpj)
  );
ALTER TABLE fin_partner ADD COLUMN IF NOT EXISTS entity_id BIGINT REFERENCES fin_entity(id);
ALTER TABLE fin_partner ADD COLUMN IF NOT EXISTS registro_profissional TEXT;
ALTER TABLE fin_partner ADD COLUMN IF NOT EXISTS origem_doc JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS fin_partner_entity_idx ON fin_partner (company_id, entity_id);

CREATE TABLE IF NOT EXISTS fin_goal (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES empresas(id),
    tipo TEXT NOT NULL CHECK (tipo IN ('faturamento','credito')),
    period_type TEXT NOT NULL CHECK (period_type IN ('month','quarter','semester','year','rolling12')),
    period_key TEXT NOT NULL,
    target_cents BIGINT NOT NULL CHECK (target_cents > 0),
    titulo TEXT,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, tipo, period_type, period_key)
  );
CREATE TABLE IF NOT EXISTS fin_goal_milestone (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES empresas(id),
    ordem INTEGER NOT NULL CHECK (ordem BETWEEN 1 AND 4),
    nome TEXT NOT NULL,
    valor_mensal_cents BIGINT NOT NULL CHECK (valor_mensal_cents > 0),
    note TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, ordem)
  );
CREATE TABLE IF NOT EXISTS fin_credit_line (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES empresas(id),
    line_key TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version >= 1),
    nome TEXT NOT NULL,
    etapa TEXT NOT NULL DEFAULT 'meta_interna' CHECK (etapa IN ('meta_interna','requisito_preliminar','simulacao','pre_analise_bancaria','aprovacao_formal')),
    conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'aguardando_verificacao' CHECK (status IN ('aguardando_verificacao','verificada')),
    fonte_oficial TEXT,
    fonte_url TEXT,
    verificada_em DATE,
    created_by INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, line_key, version),
    CHECK (status <> 'verificada' OR (fonte_oficial IS NOT NULL AND fonte_url IS NOT NULL AND verificada_em IS NOT NULL))
  );

CREATE TABLE IF NOT EXISTS fin_ledger_entry (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES empresas(id),
    entity_id BIGINT REFERENCES fin_entity(id),
    tipo TEXT NOT NULL CHECK (tipo IN ('receita','despesa','guia')),
    descricao TEXT NOT NULL,
    valor_cents BIGINT NOT NULL CHECK (valor_cents > 0),
    competencia DATE NOT NULL,
    data_caixa DATE,
    status TEXT NOT NULL DEFAULT 'previsto' CHECK (status IN ('previsto','realizado','cancelado')),
    origem TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual')),
    created_by INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (status <> 'realizado' OR data_caixa IS NOT NULL)
  );
CREATE INDEX IF NOT EXISTS fin_ledger_company_idx ON fin_ledger_entry (company_id, competencia DESC);

CREATE TABLE IF NOT EXISTS fin_legacy_goal (
    legacy_id INTEGER PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'legado_nao_atribuido',
    registrado_em TIMESTAMPTZ NOT NULL DEFAULT now()
  );
DO $$ BEGIN
     IF to_regclass('public.financial_goals') IS NOT NULL THEN
       INSERT INTO fin_legacy_goal (legacy_id) SELECT id FROM financial_goals ON CONFLICT DO NOTHING;
     END IF;
   END $$;
