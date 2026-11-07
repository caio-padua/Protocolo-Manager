-- Identidade empresarial separada da configuração histórica por unidade.
CREATE TABLE IF NOT EXISTS paxmed_2b_empresa_identidade (
  empresa_id INTEGER PRIMARY KEY REFERENCES empresas(id),
  nome_cabecalho TEXT NOT NULL,
  rodape_linha1 TEXT NOT NULL,
  rodape_linha2 TEXT NOT NULL,
  rodape_linha3 TEXT NOT NULL,
  simbolo_path TEXT NOT NULL,
  versao INTEGER NOT NULL DEFAULT 1,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS paxmed_2b_empresa_upload (
  id UUID PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  professional_id INTEGER NOT NULL REFERENCES professionals(id),
  expira_em TIMESTAMPTZ NOT NULL,
  usado_em TIMESTAMPTZ
);

-- O responsável autorizou expressamente os dados do Instituto. Nunca substituir
-- uma identidade empresarial já configurada e nunca copiar para outras empresas.
INSERT INTO paxmed_2b_empresa_identidade
  (empresa_id, nome_cabecalho, rodape_linha1, rodape_linha2, rodape_linha3, simbolo_path)
SELECT empresa_id, nome_clinica, nome_clinica, endereco_linha1, endereco_linha2, simbolo_path
FROM paxmed_2b_identidade
WHERE location_id = 8 AND empresa_id = 5
ON CONFLICT (empresa_id) DO NOTHING;
