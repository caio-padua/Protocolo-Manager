BEGIN;

-- Aditivo: identidade de conta, vínculo autorizado a clínicas e mensagens
-- próprias da conta. Não altera nem copia evolution_instancias/evolution_mensagens.
CREATE TABLE IF NOT EXISTS evolution_conta_identidades (
  account_id UUID PRIMARY KEY,
  account_key TEXT NOT NULL
    CHECK (account_key IN ('pessoal_proprietario', 'terceira')),
  owner_professional_id INTEGER NOT NULL
    REFERENCES professionals(id) ON DELETE RESTRICT,
  base_url TEXT,
  instance_name TEXT,
  connection_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  capture_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  learning_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  replies_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_por INTEGER REFERENCES professionals(id) ON DELETE RESTRICT,
  UNIQUE (account_id, account_key),
  UNIQUE (owner_professional_id, account_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS evolution_conta_identidade_instancia_uk
  ON evolution_conta_identidades (lower(base_url), instance_name)
  WHERE base_url IS NOT NULL AND instance_name IS NOT NULL;

CREATE TABLE IF NOT EXISTS evolution_conta_clinicas (
  account_id UUID NOT NULL,
  account_key TEXT NOT NULL
    CHECK (account_key IN ('pessoal_proprietario', 'terceira')),
  empresa_id INTEGER NOT NULL
    REFERENCES empresas(id) ON DELETE RESTRICT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  autorizado_por INTEGER NOT NULL
    REFERENCES professionals(id) ON DELETE RESTRICT,
  autorizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revogado_por INTEGER REFERENCES professionals(id) ON DELETE RESTRICT,
  revogado_em TIMESTAMPTZ,
  PRIMARY KEY (account_id, empresa_id),
  UNIQUE (empresa_id, account_key),
  FOREIGN KEY (account_id, account_key)
    REFERENCES evolution_conta_identidades(account_id, account_key)
    ON DELETE RESTRICT,
  CHECK ((active AND revogado_em IS NULL) OR (NOT active AND revogado_em IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS evolution_conta_clinicas_empresa_active_idx
  ON evolution_conta_clinicas (empresa_id, account_key)
  WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS evolution_conta_mensagens_identidade (
  id BIGSERIAL PRIMARY KEY,
  account_id UUID NOT NULL
    REFERENCES evolution_conta_identidades(account_id) ON DELETE RESTRICT,
  base_url TEXT NOT NULL,
  instance_name TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('entrada', 'saida')),
  contact TEXT NOT NULL,
  body TEXT NOT NULL,
  from_me BOOLEAN NOT NULL,
  provenance TEXT NOT NULL DEFAULT 'nao_classificada'
    CHECK (provenance = 'nao_classificada'),
  status TEXT NOT NULL DEFAULT 'recebida',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, base_url, instance_name, provider_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS evolution_conta_mensagem_origem_uk
  ON evolution_conta_mensagens_identidade (base_url, instance_name, provider_id);

CREATE INDEX IF NOT EXISTS evolution_conta_mensagens_identidade_busca_idx
  ON evolution_conta_mensagens_identidade (account_id, criado_em DESC);

COMMIT;
