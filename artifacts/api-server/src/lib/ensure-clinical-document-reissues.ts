import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function ensureClinicalDocumentReissuesTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS clinical_document_reissue_settings (
      empresa_id INTEGER NOT NULL,
      location_id INTEGER NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      fee_collection_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      require_human_review BOOLEAN NOT NULL DEFAULT TRUE,
      fee_amount NUMERIC(12,2) NOT NULL DEFAULT 15.00,
      document_types JSONB NOT NULL DEFAULT '{
        "prescricao": true,
        "pedido_exames": true,
        "atestado": true,
        "encaminhamento": true,
        "protocolo": true,
        "ras_fap": true,
        "carta_tratamento": true,
        "documento_assinado": true
      }'::jsonb,
      updated_by_professional_id INTEGER,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (empresa_id, location_id),
      CONSTRAINT clinical_document_reissue_fee_ck CHECK (fee_amount >= 5.00 AND fee_amount <= 100000.00)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS clinical_document_reissue_requests (
      id BIGSERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
      empresa_id INTEGER NOT NULL,
      location_id INTEGER NOT NULL,
      document_type TEXT NOT NULL,
      document_id TEXT,
      document_label TEXT NOT NULL DEFAULT 'Documento sem identificação',
      original_document_issued_at DATE,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      requested_by_channel TEXT NOT NULL,
      request_status TEXT NOT NULL DEFAULT 'requested',
      eligibility_status TEXT NOT NULL DEFAULT 'human_review',
      eligibility_reason TEXT NOT NULL,
      membership_verification TEXT NOT NULL DEFAULT 'unavailable',
      fee_amount NUMERIC(12,2),
      payment_status TEXT NOT NULL DEFAULT 'unverified',
      payment_provider TEXT,
      asaas_charge_id TEXT,
      asaas_invoice_url TEXT,
      paid_at TIMESTAMPTZ,
      client_consent_at TIMESTAMPTZ,
      client_confirmation_inbox_id BIGINT,
      require_human_review BOOLEAN NOT NULL DEFAULT TRUE,
      reviewed_by_professional_id INTEGER,
      reviewed_at TIMESTAMPTZ,
      review_note TEXT,
      document_pdf_sha256 TEXT,
      delivery_channel TEXT,
      delivery_status TEXT NOT NULL DEFAULT 'not_started',
      delivery_attempted_at TIMESTAMPTZ,
      delivery_completed_at TIMESTAMPTZ,
      delivery_result TEXT,
      delivery_share_token_hash TEXT,
      delivery_share_expires_at TIMESTAMPTZ,
      operation_key UUID NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT clinical_document_reissue_channel_ck
        CHECK (requested_by_channel IN ('telegram','client_portal','staff')),
      CONSTRAINT clinical_document_reissue_status_ck
        CHECK (request_status IN (
          'requested','awaiting_confirmation','awaiting_payment','awaiting_review',
          'approved','denied','delivery_pending','provider_accepted','failed','unknown','cancelled'
        )),
      CONSTRAINT clinical_document_reissue_eligibility_ck
        CHECK (eligibility_status IN ('free_treatment','free_member','fee_required','human_review')),
      CONSTRAINT clinical_document_reissue_payment_ck
        CHECK (payment_status IN ('not_required','awaiting_consent','pending','paid','overdue','cancelled','unverified')),
      CONSTRAINT clinical_document_reissue_delivery_ck
        CHECK (delivery_status IN ('not_started','queued','provider_accepted','failed','unknown'))
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS clinical_document_archives (
      id BIGSERIAL PRIMARY KEY,
      document_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
      empresa_id INTEGER NOT NULL,
      location_id INTEGER NOT NULL,
      professional_id INTEGER,
      document_label TEXT NOT NULL,
      file_name TEXT NOT NULL,
      issued_at DATE NOT NULL,
      signature_status TEXT NOT NULL,
      storage_key TEXT NOT NULL UNIQUE,
      pdf_sha256 TEXT,
      archive_status TEXT NOT NULL DEFAULT 'archiving',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT clinical_document_archives_status_ck
        CHECK (archive_status IN ('archiving','emitted','failed'))
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS clinical_document_reissue_events (
      id BIGSERIAL PRIMARY KEY,
      request_id BIGINT,
      empresa_id INTEGER NOT NULL,
      location_id INTEGER NOT NULL,
      actor_professional_id INTEGER,
      event_type TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_clinical_document_archives_client
      ON clinical_document_archives (empresa_id, location_id, client_id, issued_at DESC)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_clinical_document_archives_source
      ON clinical_document_archives (document_type, source_id, created_at DESC)
  `);
  await db.execute(sql`
    ALTER TABLE clinical_document_reissue_requests
      ALTER COLUMN document_id DROP NOT NULL,
      ALTER COLUMN document_label SET DEFAULT 'Documento sem identificação',
      ADD COLUMN IF NOT EXISTS client_confirmation_inbox_id BIGINT,
      ADD COLUMN IF NOT EXISTS delivery_share_token_hash TEXT,
      ADD COLUMN IF NOT EXISTS delivery_share_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS review_note TEXT
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_document_reissue_queue
      ON clinical_document_reissue_requests (empresa_id, location_id, request_status, requested_at DESC)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_document_reissue_client
      ON clinical_document_reissue_requests (client_id, requested_at DESC)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_document_reissue_events_request
      ON clinical_document_reissue_events (empresa_id, location_id, request_id, created_at DESC)
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_document_reissue_asaas_charge
      ON clinical_document_reissue_requests (asaas_charge_id)
      WHERE asaas_charge_id IS NOT NULL
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_document_reissue_share_token
      ON clinical_document_reissue_requests (delivery_share_token_hash)
      WHERE delivery_share_token_hash IS NOT NULL
  `);
  logger.info("clinical_document_reissue_requests: tabelas prontas");
}
