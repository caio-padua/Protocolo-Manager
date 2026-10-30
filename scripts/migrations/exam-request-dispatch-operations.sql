-- Additive only. Reservations are deliberately never expired or automatically retried.
CREATE TABLE IF NOT EXISTS exam_request_dispatch_operations (
  professional_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  clinic_id INTEGER NOT NULL,
  operation_key TEXT NOT NULL,
  request_hash TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (state IN ('in_progress', 'completed', 'needs_review')),
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (professional_id, empresa_id, clinic_id, operation_key)
);
