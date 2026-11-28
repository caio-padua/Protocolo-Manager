-- Configurações independentes por unidade clínica. Não altera os modelos legados.
CREATE TABLE IF NOT EXISTS paxmed_2b_identidade (
  location_id INTEGER PRIMARY KEY REFERENCES locations(id),
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  nome_clinica TEXT NOT NULL,
  endereco_linha1 TEXT NOT NULL,
  endereco_linha2 TEXT NOT NULL,
  simbolo_path TEXT NOT NULL,
  versao INTEGER NOT NULL DEFAULT 1,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cada envio temporário pertence ao profissional, à empresa e à unidade.
CREATE TABLE IF NOT EXISTS paxmed_2b_upload (
  id UUID PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  professional_id INTEGER NOT NULL REFERENCES professionals(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em TIMESTAMPTZ NOT NULL,
  usado_em TIMESTAMPTZ
);
