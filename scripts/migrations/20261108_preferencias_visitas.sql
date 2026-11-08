-- Histórico aditivo de preferências: nenhuma versão anterior é removida.
CREATE TABLE IF NOT EXISTS client_visit_preference_revisions (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  preferences JSONB NOT NULL,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_visit_pref_revision_lookup
  ON client_visit_preference_revisions (empresa_id, client_id, id DESC);
