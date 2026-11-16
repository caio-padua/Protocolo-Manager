/**
 * Marcos explícitos do processamento de um exame (trilha temporal, append-only por convenção).
 * Aditivo e idempotente (SQL bruto: o push do Drizzle já apresentou drift destrutivo nesta base).
 * Desfazer: DROP TABLE exam_document_marcos (nenhuma outra tabela depende dela).
 */
import { pool } from "@workspace/db";

export const EXAM_MARCOS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS exam_document_marcos (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL,
  marco TEXT NOT NULL CHECK (marco IN ('leitura_preliminar', 'dados_extraidos', 'processamento')),
  estado TEXT NOT NULL CHECK (estado IN ('executando', 'concluido', 'falhou')),
  detalhe JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_exam_document_marcos_doc ON exam_document_marcos (document_id, id);
`;

export async function ensureExamMarcosSchema(): Promise<void> {
  await pool.query(EXAM_MARCOS_MIGRATION_SQL);
}
