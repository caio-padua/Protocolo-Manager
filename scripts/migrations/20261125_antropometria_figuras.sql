-- Fotos de orientacao da antropometria (onde passar a fita), uma por regiao e por empresa.
CREATE TABLE IF NOT EXISTS antropometria_figuras (
  id serial PRIMARY KEY,
  empresa_id integer NOT NULL,
  regiao text NOT NULL,
  mime text NOT NULL,
  dados bytea NOT NULL,
  atualizado_por integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT antropometria_figuras_empresa_regiao_uq UNIQUE (empresa_id, regiao)
);
