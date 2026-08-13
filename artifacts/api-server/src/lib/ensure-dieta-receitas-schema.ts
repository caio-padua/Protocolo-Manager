/**
 * Migração de boot idempotente (CREATE/ALTER IF NOT EXISTS) para o pedaço de
 * schema criado pela Task 234 (Tipos de Dieta, Receitas e Lista de Compras):
 *   - 4 colunas novas em dieta_catalogo_alimentos (preço/unidade/categoria de compra)
 *   - 3 tabelas novas: dieta_receitas, dieta_receita_ingredientes, dieta_receita_protocolos
 *
 * Alinhado byte-a-byte com o schema Drizzle em lib/db/src/schema/dieta.ts.
 * Roda ANTES do app.listen() (ver index.ts) para que, num banco novo (deploy
 * limpo/produção), as tabelas/colunas já existam antes de qualquer request ou
 * do seed de dieta tentar usá-las — nunca depender de SQL rodado manualmente
 * numa sessão de desenvolvimento.
 *
 * Padrão idêntico ao ensurePhotoHistoryTable/ensureTelegramInboxTable/
 * ensureDietaPlanosTable já usados neste projeto (ver memória:
 * "boot migration antes do listen").
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

let _schemaReady: Promise<void> | null = null;

export async function ensureDietaReceitasSchema(): Promise<void> {
  if (!_schemaReady) {
    _schemaReady = (async () => {
      // ---- 1) Colunas novas em dieta_catalogo_alimentos (tabela pré-existente) ----
      await db.execute(sql`ALTER TABLE dieta_catalogo_alimentos ADD COLUMN IF NOT EXISTS preco_medio REAL`);
      await db.execute(sql`ALTER TABLE dieta_catalogo_alimentos ADD COLUMN IF NOT EXISTS unidade_compra TEXT`);
      await db.execute(sql`ALTER TABLE dieta_catalogo_alimentos ADD COLUMN IF NOT EXISTS unidade_compra_equivalente_g REAL`);
      await db.execute(sql`ALTER TABLE dieta_catalogo_alimentos ADD COLUMN IF NOT EXISTS categoria_compra TEXT`);

      // ---- 2) dieta_receitas ----
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS dieta_receitas (
          id                  SERIAL       PRIMARY KEY,
          codigo              TEXT         NOT NULL UNIQUE,
          nome                TEXT         NOT NULL,
          modo_preparo        TEXT,
          porcoes             INTEGER      NOT NULL DEFAULT 1,
          tempo_preparo_min   INTEGER,
          observacao          TEXT,
          ativo               BOOLEAN      NOT NULL DEFAULT TRUE,
          created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
          updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
      `);

      // ---- 3) dieta_receita_ingredientes (alimento do catálogo + quantidade) ----
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS dieta_receita_ingredientes (
          id             SERIAL       PRIMARY KEY,
          receita_id     INTEGER      NOT NULL REFERENCES dieta_receitas(id) ON DELETE CASCADE,
          alimento_id    INTEGER      NOT NULL REFERENCES dieta_catalogo_alimentos(id),
          quantidade_g   REAL         NOT NULL,
          ordem          INTEGER,
          observacao     TEXT,
          created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
      `);

      // ---- 4) dieta_receita_protocolos (M2M receita x tipo de dieta) ----
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS dieta_receita_protocolos (
          id             SERIAL       PRIMARY KEY,
          receita_id     INTEGER      NOT NULL REFERENCES dieta_receitas(id) ON DELETE CASCADE,
          protocolo_id   INTEGER      NOT NULL REFERENCES dieta_protocolos(id) ON DELETE CASCADE,
          created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
          UNIQUE(receita_id, protocolo_id)
        )
      `);
    })().catch((err: unknown) => {
      _schemaReady = null;
      throw err;
    });
  }
  return _schemaReady;
}
