-- Consulta avulsa: a sessao marcada na agenda pode existir sem protocolo (protocol_id NULL).
-- Somente retira a obrigatoriedade da coluna; nenhum dado existente e alterado. Idempotente.
-- Uso: somente desenvolvimento ate ordem escrita do CEO (mesma regra das migracoes 20261116 a 20261122).
ALTER TABLE sessions ALTER COLUMN protocol_id DROP NOT NULL;
