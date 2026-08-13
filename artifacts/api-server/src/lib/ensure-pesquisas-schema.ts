/**
 * Migração de boot idempotente (CREATE TABLE IF NOT EXISTS) para a Central de
 * Pesquisa (Apify) — Task 235.
 *
 * Alinhado byte-a-byte com o schema Drizzle em lib/db/src/schema/pesquisas.ts.
 * Roda ANTES do app.listen() (ver index.ts) para que, num banco novo (deploy
 * limpo/produção), a tabela já exista antes de qualquer request.
 *
 * Padrão idêntico ao ensureDietaReceitasSchema/ensureTelegramInboxTable já
 * usados neste projeto (ver memória: "boot migration antes do listen").
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

let _schemaReady: Promise<void> | null = null;

export async function ensurePesquisasSchema(): Promise<void> {
  if (!_schemaReady) {
    _schemaReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS pesquisas (
          id                    SERIAL       PRIMARY KEY,
          tipo                  TEXT         NOT NULL,
          status                TEXT         NOT NULL DEFAULT 'em_andamento',
          parametros            JSONB        NOT NULL,
          apify_actor_id        TEXT,
          apify_run_id          TEXT,
          apify_dataset_id      TEXT,
          resultado_resumo      JSONB,
          resultado_bruto       JSONB,
          erro                  TEXT,
          solicitado_por_id     INTEGER,
          solicitado_por_nome   TEXT,
          aplicado_em           TIMESTAMPTZ,
          origem_pesquisa_id    INTEGER,
          created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
          updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
      `);

      await db.execute(sql`CREATE INDEX IF NOT EXISTS pesquisas_tipo_idx ON pesquisas (tipo)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS pesquisas_status_idx ON pesquisas (status)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS pesquisas_created_at_idx ON pesquisas (created_at)`);
    })().catch((err: unknown) => {
      _schemaReady = null;
      throw err;
    });
  }
  return _schemaReady;
}
