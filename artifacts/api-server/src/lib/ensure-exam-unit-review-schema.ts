/**
 * Migração de boot dos pedidos de segunda opinião de UNIDADE (aditiva e idempotente; nunca apaga).
 * Um pedido por PERGUNTA (analito + unidade de origem + unidade padrão + contexto + escopo), não por documento.
 * A chave semântica única deduplica lotes e a transição approved -> consumed é feita por UPDATE condicional.
 */
import { pool } from "@workspace/db";

export const EXAM_UNIT_REVIEW_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS exam_unit_review_request (
  id SERIAL PRIMARY KEY,
  semantic_key TEXT NOT NULL,
  empresa_id INTEGER NOT NULL,
  scope TEXT NOT NULL DEFAULT 'empresa' CHECK (scope IN ('empresa', 'global')),
  analyte_code TEXT NOT NULL,
  unit_origin_raw TEXT NOT NULL,
  unit_origin_norm TEXT NOT NULL,
  unit_target TEXT NOT NULL,
  context_key TEXT NOT NULL DEFAULT '',
  unit_class TEXT NOT NULL,
  ai_eligible BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'consumed', 'rejected', 'expired', 'uncertain', 'failed')),
  version INTEGER NOT NULL DEFAULT 1,
  occurrences INTEGER NOT NULL DEFAULT 1,
  cost_cap_usd NUMERIC(10,4),
  cost_est_usd NUMERIC(10,4),
  cost_real_usd NUMERIC(10,6),
  idempotency_key TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by INTEGER,
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  decided_by INTEGER,
  result JSONB,
  verdict TEXT CHECK (verdict IN ('promovido', 'curadoria', 'rejeitado_motor')),
  error_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_exam_unit_review_semantic ON exam_unit_review_request (semantic_key);
CREATE UNIQUE INDEX IF NOT EXISTS ux_exam_unit_review_idem ON exam_unit_review_request (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_exam_unit_review_status ON exam_unit_review_request (empresa_id, status, requested_at);
CREATE INDEX IF NOT EXISTS ix_exam_unit_review_consumed ON exam_unit_review_request (consumed_at) WHERE consumed_at IS NOT NULL;
`;

let ready: Promise<void> | null = null;
export function ensureExamUnitReviewSchema(): Promise<void> {
  if (!ready) {
    ready = pool.query(EXAM_UNIT_REVIEW_MIGRATION_SQL).then(() => undefined).catch((e) => { ready = null; throw e; });
  }
  return ready;
}
