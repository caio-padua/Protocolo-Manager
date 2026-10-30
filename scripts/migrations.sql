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
