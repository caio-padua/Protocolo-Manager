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
