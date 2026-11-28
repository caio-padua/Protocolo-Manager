-- Locais externos: exclusao definitiva so com confirmacao do CEO. Nada e apagado de fato (Regra de Ouro):
-- "excluir" apenas carimba excluido_em e o local some das telas; a linha continua no banco e pode ser recuperada.
-- Aditiva e idempotente.
ALTER TABLE locais_externos
  ADD COLUMN IF NOT EXISTS excluido_em timestamptz,
  ADD COLUMN IF NOT EXISTS excluido_por integer;
