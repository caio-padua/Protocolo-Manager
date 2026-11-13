-- Classificacao (A a D, inicial D) e plano (bronze, prata, ouro, rodio; inicial bronze) do cliente.
-- DEFAULT preenche os existentes e os novos; quem ja tiver valor nao e sobrescrito.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS classificacao text NOT NULL DEFAULT 'D';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS plano text NOT NULL DEFAULT 'bronze';
