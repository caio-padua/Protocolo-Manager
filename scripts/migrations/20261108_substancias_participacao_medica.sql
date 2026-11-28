-- Apenas acrescenta o campo; cadastros existentes ficam sem definição.
ALTER TABLE substances ADD COLUMN IF NOT EXISTS doctor_participation BOOLEAN;
