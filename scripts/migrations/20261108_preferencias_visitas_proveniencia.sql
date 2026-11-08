-- Alteração aditiva: preserva todas as revisões já existentes.
ALTER TABLE client_visit_preference_revisions
  ADD COLUMN IF NOT EXISTS executor_kind TEXT NOT NULL DEFAULT 'professional',
  ADD COLUMN IF NOT EXISTS executor_label TEXT,
  ADD COLUMN IF NOT EXISTS authorizer_professional_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_visit_pref_executor_provenance'
      AND conrelid = 'client_visit_preference_revisions'::regclass
  ) THEN
    ALTER TABLE client_visit_preference_revisions
      ADD CONSTRAINT client_visit_pref_executor_provenance CHECK (
        (executor_kind = 'professional' AND executor_label IS NULL AND authorizer_professional_id IS NULL)
        OR
        (executor_kind = 'agent' AND executor_label IS NOT NULL AND length(trim(executor_label)) > 0
         AND authorizer_professional_id IS NOT NULL AND authorizer_professional_id = created_by)
      );
  END IF;
END $$;
