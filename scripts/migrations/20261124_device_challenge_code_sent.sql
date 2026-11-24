-- Nullable intentionally: challenge creation does not prove a provider accepted
-- the message. Historical rows must not be backfilled as successfully sent.
ALTER TABLE IF EXISTS device_contact_verifications
  ADD COLUMN IF NOT EXISTS code_sent_at TIMESTAMPTZ;
