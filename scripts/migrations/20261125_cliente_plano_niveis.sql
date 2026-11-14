-- Niveis de relacionamento do cliente: Prata, Ouro, Platinum e Diamond (decisao do CEO, 14/11/2026).
-- Substitui o modelo anterior (bronze, prata, ouro, platina). Entrada = prata.
-- Idempotente: so converte os valores antigos; quem ja esta no modelo novo nao e tocado.
-- O antigo "bronze" (porta de entrada) vira "prata"; o antigo "platina" vira "platinum".
-- "prata" e "ouro" mantem o nome (nenhum cliente estava em prata no momento da troca).
ALTER TABLE clients ALTER COLUMN plano SET DEFAULT 'prata';
UPDATE clients SET plano = 'prata' WHERE plano = 'bronze';
UPDATE clients SET plano = 'platinum' WHERE plano = 'platina';
