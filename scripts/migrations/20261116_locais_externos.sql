-- Locais externos da clinica: consultorios sublocados (outro endereco) que pertencem ao MESMO CNPJ da empresa.
-- Aditiva e idempotente. Nao altera nem apaga locations, agendas ou qualquer dado existente.
-- Endereco da agenda EXTERNA continua gravado na propria agenda (agenda_resources.external_*);
-- este cadastro e a lista de onde a agenda copia o endereco, para ninguem digitar duas vezes.
CREATE TABLE IF NOT EXISTS locais_externos (
  id          serial PRIMARY KEY,
  empresa_id  integer NOT NULL,
  nome        text NOT NULL,
  cep         text NOT NULL,
  logradouro  text NOT NULL,
  numero      text NOT NULL,
  complemento text,
  bairro      text NOT NULL,
  cidade      text NOT NULL,
  uf          text NOT NULL,
  observacao  text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS locais_externos_empresa_idx ON locais_externos (empresa_id, active);
