-- Migração apenas estrutural e aditiva para desenvolvimento/post-merge.
-- Não altera valores nem configura padrões; a atualização de dados deve ser
-- feita separadamente, depois de identificar e autorizar o ambiente de destino.
ALTER TABLE substances ADD COLUMN IF NOT EXISTS precise_duration_seconds INTEGER;
