-- Alterações aditivas: janelas anteriores continuam semanais e preservadas.
ALTER TABLE agenda_windows ADD COLUMN IF NOT EXISTS repeat_weeks INTEGER NOT NULL DEFAULT 1;
ALTER TABLE agenda_windows ADD COLUMN IF NOT EXISTS anchor_date TEXT;
ALTER TABLE agenda_windows ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
