-- Apenas ampliação estrutural. As preferências antigas continuam ativas.
ALTER TABLE client_preferred_agendas ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
