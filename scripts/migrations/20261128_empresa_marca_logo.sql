-- Logo (nome da marca, imagem larga) por empresa. O simbolo ja existe em paxmed_2b_empresa_identidade. Aditiva.
CREATE TABLE IF NOT EXISTS empresa_marca_logo (
  empresa_id      integer PRIMARY KEY REFERENCES empresas(id),
  logo_path       text NOT NULL,
  atualizado_por  integer,
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
