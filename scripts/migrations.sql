-- -----------------------------------------------------------------------------
-- MIGRAÇÕES DE SCHEMA DO PROJETO
-- Aplicado automaticamente a cada merge de task agent por scripts/post-merge.sh
-- -----------------------------------------------------------------------------
--
-- REGRAS DE ESCRITA (obrigatórias):
--
--   1. TODO comando é IDEMPOTENTE (IF NOT EXISTS / IF EXISTS).
--      O arquivo INTEIRO roda de novo a cada merge, então rodar duas vezes
--      não pode dar erro nem mudar nada na segunda vez.
--
--   2. REGRA DE OURO DO CEO — nunca destruir:
--      permitido  : ADD COLUMN, CREATE TABLE, CREATE INDEX
--      proibido   : DROP, TRUNCATE, DELETE, ALTER COLUMN ... TYPE
--      Coluna que não serve mais fica no banco, parada. Não se apaga.
--
--   3. Migração nova vai no FIM do arquivo, com um comentário dizendo
--      PARA QUE SERVE — em português, uma frase, legível pelo CEO.
--
--   4. Nunca rodar `drizzle-kit push` / `db push` no post-merge.
--      Há drift preexistente no schema: o push propõe DROP de colunas com
--      dados reais. Schema muda por ALTER TABLE escrito aqui, à mão.
--
-- -----------------------------------------------------------------------------


-- Canal de entrega da mensagem.
-- Serve para o histórico distinguir o que saiu pelo Telegram do que saiu pelo
-- WhatsApp, em vez de registrar tudo como se fosse WhatsApp.
ALTER TABLE whatsapp_mensagens_log
  ADD COLUMN IF NOT EXISTS via TEXT NOT NULL DEFAULT 'whatsapp';

-- Data de vinculação do Telegram do paciente.
-- Serve para exibir no cockpit quando o paciente ativou o canal.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS telegram_vinculado_em TIMESTAMPTZ;

-- Resultado do último envio real ao chatId do paciente.
-- true = entregue, false = falhou (chatId suspeito), null = nunca testado.
-- Alimentado pelo endpoint POST /cockpit/:id/telegram-inbox/enviar.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS telegram_last_test_ok BOOLEAN;

-- Unique partial index for assinatura_solicitacoes.zapsign_external_id.
-- Enforces that only ONE provider envelope is created per deterministic external
-- ID, even under concurrent requests (INSERT ... ON CONFLICT DO NOTHING relies on
-- this index in enviarAssinatura). WHERE NOT NULL allows multiple rows without an
-- external ID (e.g., drafts) to coexist without conflict.
CREATE UNIQUE INDEX IF NOT EXISTS idx_assinatura_solicitacoes_external_id_unique
  ON assinatura_solicitacoes (zapsign_external_id)
  WHERE zapsign_external_id IS NOT NULL;

-- ── LINK MÁGICO DO TELEGRAM ────────────────────────────────────────────────
-- Token de uso único, com validade, enviado no botão do e-mail de onboarding.
-- O paciente toca no botão, o Telegram abre o bot e envia "/start <token>"
-- sozinho — sem precisar digitar a senha de validação.
-- telegram_magic_usado_em NULL = ainda não gasto; preenchido = já vinculou.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS telegram_magic_token TEXT;
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS telegram_magic_expira_em TIMESTAMPTZ;
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS telegram_magic_usado_em TIMESTAMPTZ;

-- Um token nunca pode pertencer a dois pacientes.
-- NULL não colide em índice único no Postgres, então os pacientes sem token
-- convivem sem conflito.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_clients_telegram_magic_token
  ON clients (telegram_magic_token)
  WHERE telegram_magic_token IS NOT NULL;

-- Um celular nunca pode pertencer a dois pacientes.
-- Sem este índice, dois links mágicos tocados no MESMO aparelho criariam dois
-- donos para o mesmo chat e o inbox passaria a misturar prontuários.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_clients_telegram_chat_id
  ON clients (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

-- Impede reenvio duplicado de pedidos, inclusive em duas janelas simultâneas.
\ir migrations/exam-request-dispatch-operations.sql

-- Personal selections are independent of issued documents; catalogue snapshots survive removal.
CREATE TABLE IF NOT EXISTS personal_exam_sets (
  id SERIAL PRIMARY KEY,
  professional_id INTEGER NOT NULL REFERENCES professionals(id),
  location_id INTEGER NOT NULL REFERENCES locations(id),
  empresa_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  items JSONB NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS personal_exam_sets_owner
  ON personal_exam_sets (professional_id, location_id, empresa_id);

-- Vínculo explícito do colaborador à empresa, já existente na base original.
-- Não inferir nem sobrescrever vínculos ao instalar em outra clínica.
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS empresa_id INTEGER;

-- Direção da mensagem no inbox Telegram do cockpit.
-- Serve para distinguir mensagens enviadas pelo CEO ('saida') das recebidas
-- do paciente ('entrada'), permitindo alertas Slack quando o paciente responde.
ALTER TABLE telegram_inbox_messages
  ADD COLUMN IF NOT EXISTS direcao TEXT NOT NULL DEFAULT 'entrada';

-- Identidade administrativa e revogacao de sessoes do colaborador.
-- A autoridade global fica separada do marcador clinico de Medico Principal.
ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS is_platform_owner BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS credential_version INTEGER NOT NULL DEFAULT 0;

-- Garante um unico proprietario global e identificadores de login sem colisao.
-- Se houver e-mails ou CPFs duplicados, esta migracao para sem alterar esses dados.
CREATE UNIQUE INDEX IF NOT EXISTS professionals_platform_owner_singleton_uk
  ON professionals (is_platform_owner)
  WHERE is_platform_owner IS TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS professionals_email_normalized_uk
  ON professionals (lower(btrim(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS professionals_cpf_digits_uk
  ON professionals (regexp_replace(cpf, '[^0-9]', '', 'g'))
  WHERE cpf IS NOT NULL AND regexp_replace(cpf, '[^0-9]', '', 'g') <> '';

-- Atribuicao de proprietario nao e feita por migracao: cada clinica licenciada
-- pode ter seu proprio Medico Principal. O perfil escolhido pelo CEO foi
-- marcado explicitamente apenas no banco de desenvolvimento; producao exige
-- mapeamento operacional revisado, sem promover automaticamente um medico.

-- E-mail secundário e identificação do titular/contexto da clínica no histórico
-- profissional; preserva rastreabilidade sem substituir o ator que executou a mudança.
ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS secondary_email TEXT;

ALTER TABLE collaborator_audit
  ADD COLUMN IF NOT EXISTS subject_professional_id INTEGER;

ALTER TABLE collaborator_audit
  ADD COLUMN IF NOT EXISTS subject_professional_name TEXT;

ALTER TABLE collaborator_audit
  ADD COLUMN IF NOT EXISTS empresa_id INTEGER;

CREATE INDEX IF NOT EXISTS collaborator_audit_subject_created_idx
  ON collaborator_audit (subject_professional_id, created_at);

-- Permissões clínicas por unidade, pedidos de conferência e trilhas que não podem
-- ser apagadas pela aplicação. Os acessos existentes começam desligados.
CREATE TABLE IF NOT EXISTS clinical_access_grants (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  professional_id INTEGER NOT NULL REFERENCES professionals(id),
  can_prescribe BOOLEAN NOT NULL DEFAULT FALSE,
  can_request_exams BOOLEAN NOT NULL DEFAULT FALSE,
  is_clinic_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_responsible_doctor BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by_professional_id INTEGER NOT NULL REFERENCES professionals(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clinical_access_grants_positive_scope_ck
    CHECK (empresa_id > 0 AND location_id > 0 AND professional_id > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS clinical_access_grants_professional_location_uk
  ON clinical_access_grants (professional_id, location_id);
CREATE UNIQUE INDEX IF NOT EXISTS clinical_access_grants_one_responsible_per_location_uk
  ON clinical_access_grants (location_id)
  WHERE is_responsible_doctor IS TRUE;
CREATE INDEX IF NOT EXISTS clinical_access_grants_location_company_idx
  ON clinical_access_grants (location_id, empresa_id);

CREATE TABLE IF NOT EXISTS clinical_approval_requests (
  id SERIAL PRIMARY KEY,
  request_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('prescricao', 'pedido_exames')),
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'processando', 'aprovado', 'rejeitado', 'conferir_resultado')),
  empresa_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  client_id INTEGER NOT NULL REFERENCES clients(id),
  prepared_by_professional_id INTEGER NOT NULL REFERENCES professionals(id),
  payload JSONB NOT NULL,
  result JSONB,
  rejection_reason TEXT,
  decided_by_professional_id INTEGER REFERENCES professionals(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  CONSTRAINT clinical_approval_requests_positive_scope_ck
    CHECK (empresa_id > 0 AND location_id > 0 AND client_id > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS clinical_approval_requests_requester_key_uk
  ON clinical_approval_requests (prepared_by_professional_id, request_key);
CREATE INDEX IF NOT EXISTS clinical_approval_requests_review_queue_idx
  ON clinical_approval_requests (empresa_id, location_id, status, created_at);
CREATE INDEX IF NOT EXISTS clinical_approval_requests_requester_history_idx
  ON clinical_approval_requests (prepared_by_professional_id, created_at);

CREATE TABLE IF NOT EXISTS clinical_approval_events (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES clinical_approval_requests(id),
  actor_professional_id INTEGER NOT NULL REFERENCES professionals(id),
  event_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clinical_approval_events_request_timeline_idx
  ON clinical_approval_events (request_id, created_at);

CREATE TABLE IF NOT EXISTS clinical_access_audit (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  subject_professional_id INTEGER NOT NULL REFERENCES professionals(id),
  actor_professional_id INTEGER NOT NULL REFERENCES professionals(id),
  before JSONB,
  after JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clinical_access_audit_scope_timeline_idx
  ON clinical_access_audit (empresa_id, location_id, created_at);
CREATE INDEX IF NOT EXISTS clinical_access_audit_subject_timeline_idx
  ON clinical_access_audit (subject_professional_id, created_at);

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS approval_request_id INTEGER;
ALTER TABLE exam_request_pdfs
  ADD COLUMN IF NOT EXISTS approval_request_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS prescriptions_approval_request_unique
  ON prescriptions (approval_request_id)
  WHERE approval_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS exam_request_pdfs_approval_request_idx
  ON exam_request_pdfs (approval_request_id)
  WHERE approval_request_id IS NOT NULL;
