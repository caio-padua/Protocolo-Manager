-- PAX FINANCE: documentos oficiais (aditivo, idempotente). Espelho de PAX_FINANCE_DDL.
CREATE TABLE IF NOT EXISTS fin_doc_import (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES empresas(id),
    slot TEXT NOT NULL CHECK (slot IN ('cnpj_rfb','certidao_jucesp','contrato_social')),
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL CHECK (file_size > 0),
    sha256 TEXT NOT NULL,
    file_bytes BYTEA NOT NULL,
    metodo TEXT NOT NULL CHECK (metodo IN ('texto','visao_ia')),
    campos JSONB NOT NULL DEFAULT '{}'::jsonb,
    sensiveis JSONB NOT NULL DEFAULT '{}'::jsonb,
    conferencia JSONB NOT NULL DEFAULT '{}'::jsonb,
    avisos JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'extraido' CHECK (status IN ('extraido','aplicado','substituido','rejeitado')),
    uploaded_by INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_by INTEGER,
    applied_at TIMESTAMPTZ
  );

CREATE INDEX IF NOT EXISTS fin_doc_import_company_idx ON fin_doc_import (company_id, slot, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS fin_doc_import_hash_uq ON fin_doc_import (company_id, slot, sha256) WHERE status IN ('extraido','aplicado');

CREATE TABLE IF NOT EXISTS fin_company_registry (
    company_id INTEGER PRIMARY KEY REFERENCES empresas(id),
    dados JSONB NOT NULL DEFAULT '{}'::jsonb,
    sensiveis JSONB NOT NULL DEFAULT '{}'::jsonb,
    origem JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by INTEGER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

-- Catalogo de CNAE (IBGE, 1.332 subclasses; semeado de forma idempotente pela aplicacao na primeira consulta)
CREATE TABLE IF NOT EXISTS fin_cnae_catalogo (
  codigo TEXT PRIMARY KEY CHECK (codigo ~ '^[0-9]{2}\.[0-9]{2}-[0-9]-[0-9]{2}$'),
  descricao TEXT NOT NULL,
  divisao TEXT,
  area_saude TEXT,
  busca TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'ibge' CHECK (origem IN ('ibge','manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_cnae_catalogo_area ON fin_cnae_catalogo (area_saude);
