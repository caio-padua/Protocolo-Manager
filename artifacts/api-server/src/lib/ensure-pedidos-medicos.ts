/**
 * Boot migration: cria a tabela client_medical_requests (pedido médico do cliente).
 * Aditiva e idempotente (Regra de Ouro: nunca DROP). Roda ANTES do app.listen.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function ensurePedidosMedicosTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS client_medical_requests (
      id                          SERIAL PRIMARY KEY,
      client_id                   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      empresa_id                  INTEGER NOT NULL,
      location_id                 INTEGER NOT NULL,
      kind                        TEXT NOT NULL,
      details                     TEXT NOT NULL,
      status                      TEXT NOT NULL DEFAULT 'aguardando_pagamento',
      amount                      NUMERIC(12,2),
      asaas_customer_id           TEXT,
      asaas_charge_id             TEXT,
      asaas_invoice_url           TEXT,
      paid_at                     TEXT,
      assigned_professional_id    INTEGER,
      assigned_reason             TEXT,
      decided_by_professional_id  INTEGER,
      decision_note               TEXT,
      issued_reference            TEXT,
      refund_pending              BOOLEAN NOT NULL DEFAULT FALSE,
      created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT client_medical_requests_kind_ck CHECK (kind IN ('receita','pedido_exames')),
      CONSTRAINT client_medical_requests_status_ck CHECK (
        status IN ('aguardando_pagamento','pago','em_analise','emitido','recusado','cancelado'))
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_cmr_client ON client_medical_requests (client_id, created_at)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_cmr_queue
      ON client_medical_requests (empresa_id, location_id, status)
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cmr_charge
      ON client_medical_requests (asaas_charge_id) WHERE asaas_charge_id IS NOT NULL
  `);
  await db.execute(sql`ALTER TABLE client_medical_requests ADD COLUMN IF NOT EXISTS isento_beneficio_id INTEGER`);
  await db.execute(sql`ALTER TABLE client_medical_requests ADD COLUMN IF NOT EXISTS draft_items TEXT`);
  await db.execute(sql`ALTER TABLE client_medical_requests ADD COLUMN IF NOT EXISTS doc_pdf_id INTEGER`);
  await db.execute(sql`ALTER TABLE client_medical_requests ADD COLUMN IF NOT EXISTS doc_send_status TEXT`);
  await db.execute(sql`ALTER TABLE client_medical_requests ADD COLUMN IF NOT EXISTS doc_sent_at TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE client_medical_requests ADD COLUMN IF NOT EXISTS doc_send_error TEXT`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS client_member_beneficios (
      id          SERIAL PRIMARY KEY,
      empresa_id  INTEGER NOT NULL,
      client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      beneficio   TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'ativo',
      ambiente    TEXT NOT NULL DEFAULT 'real',
      motivo      TEXT NOT NULL,
      valido_ate  DATE,
      criado_por  INTEGER,
      criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT cmb_beneficio_ck CHECK (beneficio IN ('pedido_exames','receita')),
      CONSTRAINT cmb_status_ck CHECK (status IN ('ativo','revogado')),
      CONSTRAINT cmb_ambiente_ck CHECK (ambiente IN ('teste','real'))
    )`);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cmb_ativo
      ON client_member_beneficios (empresa_id, client_id, beneficio) WHERE status = 'ativo'`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS client_member_beneficios_hist (
      id          SERIAL PRIMARY KEY,
      beneficio_id INTEGER NOT NULL,
      empresa_id  INTEGER NOT NULL,
      client_id   INTEGER NOT NULL,
      acao        TEXT NOT NULL,
      antes       JSONB,
      depois      JSONB,
      por         INTEGER,
      em          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  logger.info("client_medical_requests: tabela pronta");
}
