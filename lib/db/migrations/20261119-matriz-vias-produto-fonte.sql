-- Matriz de fornecedores: todas as vias de uso como categoria + nome comercial da fonte.
-- Aditiva e idempotente. A restrição de valores é trocada por outra MAIS LARGA (nenhum dado é apagado).

-- 1) Novas categorias de via: EV (endovenosa) e ID (intradérmica).
ALTER TABLE precificacao_categorias DROP CONSTRAINT IF EXISTS precificacao_categorias_cat_ck;
ALTER TABLE precificacao_categorias ADD CONSTRAINT precificacao_categorias_cat_ck
  CHECK (categoria IN ('IM','EV','SC','ID','IMPLANTE','OUTRAS','SEM_VIA'));

-- 2) EV e ID nascem com a margem e o modo que OUTRAS já tinha (hoje 0 % e automático), em cada clínica.
INSERT INTO precificacao_categorias (empresa_id, categoria, margem_pct, modo, atualizado_por)
SELECT empresa_id, nv.categoria, margem_pct, modo, atualizado_por
  FROM precificacao_categorias CROSS JOIN (VALUES ('EV'), ('ID')) AS nv(categoria)
 WHERE precificacao_categorias.categoria = 'OUTRAS'
ON CONFLICT (empresa_id, categoria) DO NOTHING;

-- 3) Nome comercial do produto como veio na tabela do laboratório (ex.: "Pill Food", "Bioprolin").
ALTER TABLE substance_ofertas ADD COLUMN IF NOT EXISTS produto_fonte text;
UPDATE substance_ofertas
   SET produto_fonte = btrim(split_part(fonte_texto, '|', 3))
 WHERE produto_fonte IS NULL AND origem_chave LIKE 'farmatec-%' AND split_part(fonte_texto, '|', 3) <> '';
