-- A confirmação é aditiva e não modifica nenhuma via ou dose existente.
ALTER TABLE catalogo_itens
  ADD COLUMN IF NOT EXISTS via_uso_revisada boolean NOT NULL DEFAULT false;
ALTER TABLE catalogo_injetaveis
  ADD COLUMN IF NOT EXISTS via_revisada boolean NOT NULL DEFAULT false;
