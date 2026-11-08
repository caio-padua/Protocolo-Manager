-- Reserva durável antes da chamada ao Google; não altera eventos existentes.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS google_sync_pending_operation TEXT,
  ADD COLUMN IF NOT EXISTS google_sync_pending_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_sync_pending_calendar_id TEXT;
