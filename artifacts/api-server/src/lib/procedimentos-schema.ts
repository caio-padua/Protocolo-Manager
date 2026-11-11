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
  CREATE INDEX IF NOT EXISTS procedimentos_clinicos_empresa_nome_idx
    ON procedimentos_clinicos (empresa_id, nome, id);
  CREATE TABLE IF NOT EXISTS procedimento_produtos (
    procedimento_id INTEGER NOT NULL REFERENCES procedimentos_clinicos(id),
    produto_id INTEGER NOT NULL REFERENCES substances(id),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (procedimento_id, produto_id)
  );
`;
