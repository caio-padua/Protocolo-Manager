-- Local de atendimento: modalidade (presencial/online) e sinalizador "mesmo endereco da empresa".
-- Somente ADD COLUMN (Regra de Ouro: nunca destruir).
ALTER TABLE locations ADD COLUMN IF NOT EXISTS modalidade TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS mesmo_endereco_empresa BOOLEAN NOT NULL DEFAULT FALSE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'locations_modalidade_check') THEN
    ALTER TABLE locations ADD CONSTRAINT locations_modalidade_check
      CHECK (modalidade IS NULL OR modalidade IN ('presencial','online'));
  END IF;
END $$;
