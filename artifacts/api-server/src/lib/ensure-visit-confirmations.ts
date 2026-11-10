/**
 * Migração de boot idempotente da confirmação do cliente por visita (K8).
 *
 * SQL bruto de propósito: o push automático do drizzle já propôs apagar colunas
 * com dados reais por causa de drift. Aqui só se CRIA (nada é alterado nem apagado).
 *
 * Uma linha por visita (session_id único). Nenhum valor secreto fica em texto puro:
 * a chave de 6 dígitos guarda só o hash (HMAC) e o link guarda só um sal aleatório
 * (o token é recalculado com o segredo do servidor).
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

let _ready: Promise<void> | null = null;

export async function ensureVisitConfirmations(): Promise<void> {
  if (!_ready) {
    _ready = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS visit_confirmations (
          id SERIAL PRIMARY KEY,
          session_id INTEGER NOT NULL,
          empresa_id INTEGER NOT NULL,
          client_id INTEGER NOT NULL,
          location_id INTEGER,
          state TEXT NOT NULL DEFAULT 'sem_pedido',
          key_hash TEXT,
          key_expires_at TIMESTAMPTZ,
          key_attempts INTEGER NOT NULL DEFAULT 0,
          key_sent_at TIMESTAMPTZ,
          key_used_at TIMESTAMPTZ,
          rubrica_at TIMESTAMPTZ,
          rubrica_method TEXT,
          rubrica_by_professional_id INTEGER,
          pending_at TIMESTAMPTZ,
          pending_by_professional_id INTEGER,
          pending_origin TEXT,
          pending_reason TEXT,
          link_nonce TEXT,
          link_expires_at TIMESTAMPTZ,
          client_emails_sent INTEGER NOT NULL DEFAULT 0,
          client_email_failures INTEGER NOT NULL DEFAULT 0,
          next_client_email_at TIMESTAMPTZ,
          final_due_at TIMESTAMPTZ,
          manager_first_sent_at TIMESTAMPTZ,
          manager_final_sent_at TIMESTAMPTZ,
          confirmed_at TIMESTAMPTZ,
          confirmed_late BOOLEAN NOT NULL DEFAULT FALSE,
          confirmed_fingerprint TEXT,
          challenge_round INTEGER NOT NULL DEFAULT 0,
          challenge_attempts INTEGER NOT NULL DEFAULT 0,
          challenge_field_a TEXT,
          challenge_field_b TEXT,
          challenge_pairs_used JSONB NOT NULL DEFAULT '[]'::jsonb,
          challenge_locked BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS visit_confirmations_session_uk
        ON visit_confirmations (session_id)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS visit_confirmations_engine_idx
        ON visit_confirmations (state, next_client_email_at)
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS visit_confirmation_events (
          id SERIAL PRIMARY KEY,
          confirmation_id INTEGER NOT NULL,
          session_id INTEGER NOT NULL,
          empresa_id INTEGER NOT NULL,
          event TEXT NOT NULL,
          professional_id INTEGER,
          detail JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS visit_confirmation_events_session_idx
        ON visit_confirmation_events (session_id, created_at)
      `);
      // K10: aviso "Aplicação realizada com sucesso". Uma linha por visita; a reserva (INSERT com conflito
      // ignorado) vem ANTES do envio, então a linha é também a prova de que o aviso já foi tentado.
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS visit_application_notices (
          id SERIAL PRIMARY KEY,
          session_id INTEGER NOT NULL,
          empresa_id INTEGER NOT NULL,
          client_id INTEGER NOT NULL,
          state TEXT NOT NULL DEFAULT 'reservado',
          applied_count INTEGER NOT NULL,
          due_count INTEGER NOT NULL,
          channels JSONB NOT NULL DEFAULT '[]'::jsonb,
          reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          finished_at TIMESTAMPTZ
        )
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS visit_application_notices_session_uk
        ON visit_application_notices (session_id)
      `);
    })().catch((error) => {
      _ready = null;
      throw error;
    });
  }
  return _ready;
}
