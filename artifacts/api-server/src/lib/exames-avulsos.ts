import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

export const EXAMES_AVULSOS_MAX_ITENS = 20;
export const EXAMES_AVULSOS_MAX_ABERTAS = 5;
export const EXAMES_AVULSOS_AVISO = "A indicação depende de avaliação profissional. Escolher exames aqui não é prescrição.";

/** Aditivo e idempotente (Regra de Ouro: nunca DROP). */
export async function ensureExamesAvulsosTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS exam_avulso_requests (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      empresa_id INTEGER,
      items JSONB NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'solicitado',
      quote_amount NUMERIC(12,2),
      quote_note TEXT,
      quoted_by INTEGER,
      quoted_at TIMESTAMPTZ,
      accepted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT exam_avulso_status_ck CHECK (status IN ('solicitado','orcamento_enviado','aceito','cancelado')),
      CONSTRAINT exam_avulso_quote_ck CHECK (quote_amount IS NULL OR quote_amount > 0)
    )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_exam_avulso_client ON exam_avulso_requests (client_id, created_at)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_exam_avulso_status ON exam_avulso_requests (status, created_at)`);
  logger.info("exam_avulso_requests: tabela pronta");
}
