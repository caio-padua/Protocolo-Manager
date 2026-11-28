-- Marca o cadastro de cliente que representa o CELULAR OFICIAL da empresa/licenca (WhatsApp e Telegram da clinica).
-- Somente o CEO (administrador da plataforma) liga ou desliga. Aditiva e reversivel: nao altera nome, CPF, telefone,
-- chat do Telegram nem situacao do cadastro. Um unico cadastro ativo por empresa pode ter a marca.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS numero_oficial_empresa boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_clients_numero_oficial_empresa
  ON clients (empresa_id) WHERE numero_oficial_empresa AND deleted_at IS NULL;
