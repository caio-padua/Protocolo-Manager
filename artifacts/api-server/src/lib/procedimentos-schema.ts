/** Migração aditiva: não atualiza nem replica dados dos catálogos existentes. */
export const PROCEDIMENTOS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS procedimentos_clinicos (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    nome TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 200),
    tipo TEXT NOT NULL CHECK (tipo IN ('consulta', 'enfermagem', 'medico')),
    descricao TEXT,
    duracao_minutos NUMERIC(8,2) CHECK (duracao_minutos IS NULL OR (duracao_minutos > 0 AND duracao_minutos <= 1440)),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE procedimentos_clinicos
    ADD COLUMN IF NOT EXISTS duracao_segundos INTEGER
    CHECK (duracao_segundos IS NULL OR duracao_segundos BETWEEN 1 AND 86400);
  ALTER TABLE procedimentos_clinicos ALTER COLUMN tipo DROP NOT NULL;
  ALTER TABLE procedimentos_clinicos ADD COLUMN IF NOT EXISTS dose TEXT;
  CREATE INDEX IF NOT EXISTS procedimentos_clinicos_empresa_nome_idx
    ON procedimentos_clinicos (empresa_id, nome, id);
  CREATE TABLE IF NOT EXISTS procedimento_produtos (
    procedimento_id INTEGER NOT NULL REFERENCES procedimentos_clinicos(id),
    produto_id INTEGER NOT NULL REFERENCES substances(id),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (procedimento_id, produto_id)
  );
  CREATE TABLE IF NOT EXISTS procedimento_equipes (
    id SERIAL PRIMARY KEY,
    procedimento_id INTEGER NOT NULL REFERENCES procedimentos_clinicos(id),
    area_id INTEGER NOT NULL REFERENCES professional_areas(id),
    location_id INTEGER NOT NULL REFERENCES locations(id),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS procedimento_equipes_profissionais (
    equipe_id INTEGER NOT NULL REFERENCES procedimento_equipes(id),
    professional_id INTEGER NOT NULL REFERENCES professionals(id),
    PRIMARY KEY (equipe_id, professional_id)
  );
  CREATE TABLE IF NOT EXISTS procedimento_revisoes (
    id SERIAL PRIMARY KEY,
    procedimento_id INTEGER NOT NULL REFERENCES procedimentos_clinicos(id),
    professional_id INTEGER NOT NULL REFERENCES professionals(id),
    conteudo_anterior JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;
