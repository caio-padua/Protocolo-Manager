-- =============================================================================
-- MIGRAÇÕES DE SCHEMA DO PROJETO
-- Aplicado automaticamente a cada merge de task agent por scripts/post-merge.sh
-- =============================================================================
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
-- =============================================================================


-- Canal de entrega da mensagem.
-- Serve para o histórico distinguir o que saiu pelo Telegram do que saiu pelo
-- WhatsApp, em vez de registrar tudo como se fosse WhatsApp.
ALTER TABLE whatsapp_mensagens_log
  ADD COLUMN IF NOT EXISTS via TEXT NOT NULL DEFAULT 'whatsapp';
