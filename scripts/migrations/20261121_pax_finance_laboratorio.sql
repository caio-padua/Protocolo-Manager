-- Laboratorio de 24 meses (aditivo, espelho de ensurePaxFinanceSchema). is_simulation so pode ser verdadeiro.
CREATE TABLE IF NOT EXISTS fin_sim_scenario (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES empresas(id),
  scenario_id TEXT NOT NULL DEFAULT 'lab-24m',
  is_simulation BOOLEAN NOT NULL DEFAULT true CHECK (is_simulation = true),
  premissas JSONB NOT NULL,
  overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  label TEXT NOT NULL DEFAULT 'AMBIENTE DE APRENDIZADO — SIMULAÇÃO — NÃO REPRESENTA FATURAMENTO REAL',
  updated_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, scenario_id)
);

-- Conformidade societaria (beneficiario final, controle efetivo, partes relacionadas). Espelho de ensurePaxFinanceSchema.
CREATE TABLE IF NOT EXISTS fin_related_party (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES empresas(id),
  entity_id BIGINT NOT NULL REFERENCES fin_entity(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('beneficiario_final','controle_efetivo','parte_relacionada')),
  nome TEXT NOT NULL,
  tipo_pessoa TEXT NOT NULL CHECK (tipo_pessoa IN ('fisica','juridica')),
  cnpj TEXT,
  participacao_bp INTEGER CHECK (participacao_bp IS NULL OR participacao_bp BETWEEN 0 AND 10000),
  via TEXT NOT NULL CHECK (via IN ('direta','indireta','contrato','procuracao','familiar','mesmo_grupo','administrador_de_fato')),
  fonte_documento TEXT,
  observacao TEXT,
  status_validacao TEXT NOT NULL DEFAULT 'rascunho' CHECK (status_validacao IN ('rascunho','validado')),
  validated_by INTEGER,
  validated_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (tipo <> 'beneficiario_final' OR tipo_pessoa = 'fisica')
);
CREATE INDEX IF NOT EXISTS fin_related_party_entity_idx ON fin_related_party (company_id, entity_id);
