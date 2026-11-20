/**
 * Boot migration do PaxCare (cofre do paciente + vinculos com clinicas). Aditiva e idempotente
 * (Regra de Ouro: nunca DROP). O cofre pertence ao PACIENTE (clients.id), nao a uma clinica.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export async function ensurePaxcareTables(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS paxcare_cofre_itens (
      id          SERIAL PRIMARY KEY,
      client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      tipo        TEXT NOT NULL,
      titulo      TEXT NOT NULL,
      data_ref    DATE,
      notas       TEXT,
      arquivo     TEXT,
      arquivo_tipo TEXT,
      arquivo_nome TEXT,
      criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      removido_em TIMESTAMPTZ,
      CONSTRAINT paxcare_cofre_tipo_ck CHECK (tipo IN ('historico','exame_externo','documento'))
    )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_paxcare_cofre_client ON paxcare_cofre_itens (client_id, criado_em)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS paxcare_vinculos (
      id            SERIAL PRIMARY KEY,
      client_id     INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      empresa_id    INTEGER NOT NULL REFERENCES empresas(id),
      status        TEXT NOT NULL DEFAULT 'ativo',
      comp_historico  BOOLEAN NOT NULL DEFAULT FALSE,
      comp_exames     BOOLEAN NOT NULL DEFAULT FALSE,
      comp_documentos BOOLEAN NOT NULL DEFAULT FALSE,
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revogado_em   TIMESTAMPTZ,
      CONSTRAINT paxcare_vinculos_status_ck CHECK (status IN ('ativo','revogado'))
    )`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS ux_paxcare_vinculo ON paxcare_vinculos (client_id, empresa_id)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS paxcare_vinculos_hist (
      id        SERIAL PRIMARY KEY,
      vinculo_id INTEGER NOT NULL REFERENCES paxcare_vinculos(id) ON DELETE CASCADE,
      acao      TEXT NOT NULL,
      detalhe   TEXT,
      em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
}
