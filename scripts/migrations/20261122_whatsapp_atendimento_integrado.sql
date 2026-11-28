-- Integra o WhatsApp da Evolution ao atendimento por clínica, com vínculo explícito e parâmetros editáveis.
-- A migração é aditiva e pode ser repetida sem apagar mensagens, vínculos ou configurações.
CREATE TABLE IF NOT EXISTS evolution_mensagens (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  instancia TEXT NOT NULL,
  direcao TEXT NOT NULL,
  contato TEXT NOT NULL,
  corpo TEXT NOT NULL,
  provider_id TEXT,
  status TEXT NOT NULL,
  erro TEXT,
  contexto TEXT,
  enviado_por INTEGER,
  processamento TEXT,
  desfecho_atendimento TEXT,
  orientacao_id BIGINT,
  plano_atendimento JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS evolution_mensagens_prov_unico
  ON evolution_mensagens (empresa_id, provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS evolution_mensagens_contato
  ON evolution_mensagens (empresa_id, contato, criado_em DESC);

CREATE TABLE IF NOT EXISTS evolution_vinculos_cliente (
  empresa_id INTEGER NOT NULL,
  cliente_id INTEGER NOT NULL,
  telefone TEXT NOT NULL,
  origem TEXT NOT NULL,
  confirmado_por INTEGER,
  confirmado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, cliente_id),
  UNIQUE (empresa_id, telefone)
);

CREATE TABLE IF NOT EXISTS evolution_homologacao_config (
  empresa_id INTEGER PRIMARY KEY,
  texto_teste TEXT NOT NULL DEFAULT '',
  motor_ativo BOOLEAN NOT NULL DEFAULT FALSE,
  modelo_selecao TEXT NOT NULL DEFAULT '',
  modelo_interprete TEXT NOT NULL DEFAULT '',
  modelo_conferente TEXT NOT NULL DEFAULT '',
  modelo_aprendiz TEXT NOT NULL DEFAULT '',
  nome_assistente TEXT NOT NULL DEFAULT '',
  atualizado_por INTEGER,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE evolution_mensagens
  ADD COLUMN IF NOT EXISTS processamento TEXT,
  ADD COLUMN IF NOT EXISTS desfecho_atendimento TEXT,
  ADD COLUMN IF NOT EXISTS orientacao_id BIGINT,
  ADD COLUMN IF NOT EXISTS plano_atendimento JSONB;

ALTER TABLE evolution_homologacao_config
  ADD COLUMN IF NOT EXISTS texto_teste TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS motor_ativo BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS modelo_selecao TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS modelo_interprete TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS modelo_conferente TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS modelo_aprendiz TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS nome_assistente TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS atualizado_por INTEGER,
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE IF EXISTS clinical_document_reissue_requests
  DROP CONSTRAINT IF EXISTS clinical_document_reissue_channel_ck;

DO $$
BEGIN
  IF to_regclass('public.clinical_document_reissue_requests') IS NOT NULL THEN
    ALTER TABLE clinical_document_reissue_requests
      ADD CONSTRAINT clinical_document_reissue_channel_ck
      CHECK (requested_by_channel IN ('telegram', 'whatsapp', 'client_portal', 'staff'));
  END IF;
END
$$;
