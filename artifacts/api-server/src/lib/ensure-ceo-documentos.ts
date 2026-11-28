/**
 * Boot migration: biblioteca de documentos da Cabine de Comando do CEO.
 * Aditiva e idempotente (Regra de Ouro: nunca DROP). O arquivo fica no Object Storage privado;
 * aqui só o registro. `arquivado_em` substitui exclusão.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export async function ensureCeoDocumentosTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ceo_documentos (
      id            SERIAL PRIMARY KEY,
      empresa_id    INTEGER REFERENCES empresas(id),
      titulo        TEXT NOT NULL,
      descricao     TEXT,
      nome_original TEXT NOT NULL,
      mime_type     TEXT NOT NULL,
      tamanho_bytes INTEGER NOT NULL,
      objeto_path   TEXT NOT NULL,
      enviado_por   INTEGER REFERENCES professionals(id),
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      arquivado_em  TIMESTAMPTZ
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ceo_documentos_empresa_idx ON ceo_documentos (empresa_id)`);
}
