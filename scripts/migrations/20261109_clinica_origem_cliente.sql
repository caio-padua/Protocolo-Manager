-- Clínica de origem é empresa informativa; não substitui empresa de segurança ou local.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS clinica_origem_empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_clients_clinica_origem_empresa ON clients (clinica_origem_empresa_id);
