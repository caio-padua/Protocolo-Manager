-- Categoria profissional do recurso do Motor de Agenda.
-- Aditivo e idempotente. Nao altera linhas existentes: recursos legados continuam
-- com category_id nulo e a categoria e derivada do campo kind na leitura.
ALTER TABLE agenda_resources ADD COLUMN IF NOT EXISTS category_id integer;

-- Trilha de auditoria de toda gravacao de categoria em recurso.
CREATE TABLE IF NOT EXISTS agenda_resource_category_audit (
  id serial PRIMARY KEY,
  resource_id integer NOT NULL,
  previous_category_id integer,
  category_id integer NOT NULL,
  origin text NOT NULL,
  evidence text,
  actor_professional_id integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
