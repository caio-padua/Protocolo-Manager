-- Identidade e instante do registro; dados anteriores permanecem desconhecidos.
ALTER TABLE substance_applications
  ADD COLUMN IF NOT EXISTS confirmed_by INTEGER,
  ADD COLUMN IF NOT EXISTS confirmed_at TEXT;
