-- Vinculo empresarial do profissional: posicoes 2 a 5 (a posicao 1 e professionals.empresa_id).
-- Somente aditivo e idempotente. Mantido identico a artifacts/api-server/src/lib/ensure-professional-empresas-schema.ts.
CREATE TABLE IF NOT EXISTS professional_empresas (
  id SERIAL PRIMARY KEY,
  professional_id INTEGER NOT NULL REFERENCES professionals(id),
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  ordem INTEGER NOT NULL CHECK (ordem BETWEEN 2 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS professional_empresas_prof_empresa_uk
  ON professional_empresas (professional_id, empresa_id);
CREATE UNIQUE INDEX IF NOT EXISTS professional_empresas_prof_ordem_uk
  ON professional_empresas (professional_id, ordem);
CREATE INDEX IF NOT EXISTS professional_empresas_empresa_idx
  ON professional_empresas (empresa_id);

-- Carga inicial: preserva acessos que ja existem (profissional ligado a local de outra empresa).
-- Local sem empresa conta como Instituto Padua (5). Nao apaga nem altera location_professionals.
WITH desejados AS (
  SELECT DISTINCT lp.professional_id, COALESCE(l.empresa_id, 5) AS empresa_id
  FROM location_professionals lp
  JOIN locations l ON l.id = lp.location_id
  JOIN professionals p ON p.id = lp.professional_id
  JOIN empresas e ON e.id = COALESCE(l.empresa_id, 5)
  WHERE COALESCE(l.empresa_id, 5) <> COALESCE(p.empresa_id, 5)
),
novos AS (
  SELECT d.professional_id, d.empresa_id
  FROM desejados d
  WHERE NOT EXISTS (
    SELECT 1 FROM professional_empresas pe
    WHERE pe.professional_id = d.professional_id AND pe.empresa_id = d.empresa_id
  )
),
numerados AS (
  SELECT n.professional_id, n.empresa_id,
         COALESCE((SELECT MAX(pe.ordem) FROM professional_empresas pe WHERE pe.professional_id = n.professional_id), 1)
         + ROW_NUMBER() OVER (PARTITION BY n.professional_id ORDER BY n.empresa_id) AS ordem
  FROM novos n
)
INSERT INTO professional_empresas (professional_id, empresa_id, ordem)
SELECT professional_id, empresa_id, ordem FROM numerados WHERE ordem <= 5
ON CONFLICT DO NOTHING;
