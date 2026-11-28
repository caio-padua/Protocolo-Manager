-- Classificacao da empresa clinica (estudo do CEO, 11/11/2026): porte assistencial e grau de complexidade.
-- Colunas novas, opcionais e sem valor inicial: nenhuma empresa existente e classificada por suposicao.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS classificacao_assistencial text;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS grau_complexidade text;
