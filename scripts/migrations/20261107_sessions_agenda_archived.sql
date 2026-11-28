-- Mantém sessão e aplicações clínicas ao retirar um compromisso da agenda.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS agenda_archived boolean NOT NULL DEFAULT false;
