-- Queue metadata only. The original clinical document and dispatch audit remain the source of truth.
CREATE TABLE IF NOT EXISTS telegram_exam_followups (
  id BIGSERIAL PRIMARY KEY,
  source_dispatch_audit_id BIGINT NOT NULL UNIQUE,
  empresa_id INTEGER NOT NULL,
  cliente_id INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  operation_key TEXT NOT NULL,
  interval_hours SMALLINT NOT NULL CHECK (interval_hours BETWEEN 1 AND 72),
  provider_accepted_at TIMESTAMPTZ,
  receipt_due_at TIMESTAMPTZ,
  booking_due_at TIMESTAMPTZ,
  state TEXT NOT NULL DEFAULT 'awaiting_dispatch'
    CHECK (state IN (
      'awaiting_dispatch',
      'receipt_pending', 'receipt_sending', 'receipt_waiting',
      'booking_pending', 'booking_sending', 'booking_waiting',
      'completed', 'closed', 'cancelled', 'needs_review'
    )),
  receipt_delivery_state TEXT NOT NULL DEFAULT 'not_sent'
    CHECK (receipt_delivery_state IN ('not_sent', 'sending', 'accepted', 'simulated', 'failed', 'unknown')),
  booking_delivery_state TEXT NOT NULL DEFAULT 'not_sent'
    CHECK (booking_delivery_state IN ('not_sent', 'sending', 'accepted', 'simulated', 'failed', 'unknown')),
  receipt_sent_at TIMESTAMPTZ,
  booking_sent_at TIMESTAMPTZ,
  receipt_answer TEXT CHECK (receipt_answer IN ('received', 'not_received', 'help', 'ambiguous')),
  booking_answer TEXT CHECK (booking_answer IN ('booked', 'not_booked', 'help', 'ambiguous')),
  receipt_reply_inbox_message_id BIGINT UNIQUE,
  booking_reply_inbox_message_id BIGINT UNIQUE,
  receipt_ack_state TEXT NOT NULL DEFAULT 'not_sent'
    CHECK (receipt_ack_state IN ('not_sent', 'sending', 'accepted', 'simulated', 'failed', 'unknown')),
  booking_ack_state TEXT NOT NULL DEFAULT 'not_sent'
    CHECK (booking_ack_state IN ('not_sent', 'sending', 'accepted', 'simulated', 'failed', 'unknown')),
  team_alert_state TEXT NOT NULL DEFAULT 'not_needed'
    CHECK (team_alert_state IN ('not_needed', 'sending', 'accepted', 'simulated', 'failed', 'unknown')),
  close_reason TEXT,
  closed_by INTEGER,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_telegram_exam_followups_due
  ON telegram_exam_followups (receipt_due_at, booking_due_at)
  WHERE state IN ('receipt_pending', 'receipt_waiting', 'booking_pending');

CREATE INDEX IF NOT EXISTS ix_telegram_exam_followups_client_active
  ON telegram_exam_followups (empresa_id, cliente_id, chat_id, state)
  WHERE state IN ('receipt_waiting', 'booking_waiting');
