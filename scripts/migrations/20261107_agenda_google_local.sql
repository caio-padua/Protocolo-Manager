-- Aba "Agenda Google" no cadastro do local. Somente ADD (Regra de Ouro).
ALTER TABLE locations ADD COLUMN IF NOT EXISTS agenda_papel TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS observacao_local TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS nome_espaco TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'locations_agenda_papel_check') THEN
    ALTER TABLE locations ADD CONSTRAINT locations_agenda_papel_check
      CHECK (agenda_papel IS NULL OR agenda_papel IN ('local','online','externo','pessoal','geral'));
  END IF;
END $$;

-- Dentro de uma mesma empresa, cada agenda Google pertence a um unico local.
-- (4 locais legados da Paluzze herdaram ids de agendas do Padua; nao foram alterados. Ver specs/agenda-google-no-local.md.)
CREATE UNIQUE INDEX IF NOT EXISTS locations_empresa_google_calendar_unique
  ON locations (empresa_id, google_calendar_id) WHERE google_calendar_id IS NOT NULL AND google_calendar_id <> '';

CREATE TABLE IF NOT EXISTS agenda_compromissos (
  id SERIAL PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  google_calendar_id TEXT,
  chave TEXT NOT NULL,
  ical_uid TEXT NOT NULL,
  titulo TEXT,
  descricao TEXT,
  local_texto TEXT,
  inicio TIMESTAMPTZ,
  fim TIMESTAMPTZ,
  dia_inteiro BOOLEAN NOT NULL DEFAULT FALSE,
  recorrencia TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  origem TEXT NOT NULL DEFAULT 'ics',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agenda_compromissos_local_chave_unique UNIQUE (location_id, chave)
);
CREATE INDEX IF NOT EXISTS agenda_compromissos_inicio_idx ON agenda_compromissos (location_id, inicio);
