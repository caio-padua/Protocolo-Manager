-- Verificação de identidade do laudo (Depuração de Exames, etapa de identidade e isolamento).
-- Aditiva e idempotente: só cria tabelas/colunas novas e amplia a lista de eventos. Desfazer: rollback/exam-identity-checks.down.sql
CREATE TABLE IF NOT EXISTS exam_identity_checks (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('verificacao', 'liberacao_humana', 'rejeicao_humana', 'auditoria_confirmou', 'auditoria_vinculo_incorreto')),
  verdict TEXT CHECK (verdict IN ('confirmada', 'revisao', 'contradicao')),
  field_results JSONB,
  reasons JSONB,
  extracted_json JSONB,
  extracted_cpf_masked TEXT,
  professional_id INTEGER,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_exam_identity_checks_doc ON exam_identity_checks (document_id, id);
CREATE INDEX IF NOT EXISTS ix_exam_identity_checks_empresa ON exam_identity_checks (empresa_id, created_at);
-- Uma verificação por documento: repetir o processamento não duplica nem reescreve a prova.
CREATE UNIQUE INDEX IF NOT EXISTS ux_exam_identity_verificacao_doc
  ON exam_identity_checks (document_id) WHERE event = 'verificacao';
-- Uma decisão humana por documento: duas liberações simultâneas não gravam duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS ux_exam_identity_decisao_doc
  ON exam_identity_checks (document_id) WHERE event IN ('liberacao_humana', 'rejeicao_humana');

-- Registro imutável: nunca UPDATE nem DELETE.
CREATE OR REPLACE FUNCTION exam_identity_checks_imutavel() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'exam_identity_checks é append-only (operação % recusada)', TG_OP;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tg_exam_identity_checks_imutavel ON exam_identity_checks;
CREATE TRIGGER tg_exam_identity_checks_imutavel
  BEFORE UPDATE OR DELETE ON exam_identity_checks
  FOR EACH ROW EXECUTE FUNCTION exam_identity_checks_imutavel();

-- Regras configuráveis por clínica: decisão, versão das regras e trilha ficam no próprio registro imutável.
ALTER TABLE exam_identity_checks ADD COLUMN IF NOT EXISTS decision TEXT;
ALTER TABLE exam_identity_checks ADD COLUMN IF NOT EXISTS rule_set_version INTEGER;
ALTER TABLE exam_identity_checks ADD COLUMN IF NOT EXISTS trail JSONB;
-- Bancos criados antes desta versão têm a lista antiga de eventos: amplia uma única vez.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'exam_identity_checks'::regclass AND conname = 'exam_identity_checks_event_check'
      AND pg_get_constraintdef(oid) LIKE '%auditoria_confirmou%'
  ) THEN
    ALTER TABLE exam_identity_checks DROP CONSTRAINT IF EXISTS exam_identity_checks_event_check;
    ALTER TABLE exam_identity_checks ADD CONSTRAINT exam_identity_checks_event_check
      CHECK (event IN ('verificacao', 'liberacao_humana', 'rejeicao_humana', 'auditoria_confirmou', 'auditoria_vinculo_incorreto'));
  END IF;
END $$;
-- Uma auditoria por documento (confirmou OU vínculo incorreto).
CREATE UNIQUE INDEX IF NOT EXISTS ux_exam_identity_auditoria_doc
  ON exam_identity_checks (document_id) WHERE event IN ('auditoria_confirmou', 'auditoria_vinculo_incorreto');
CREATE INDEX IF NOT EXISTS ix_exam_identity_checks_decision ON exam_identity_checks (empresa_id, decision, created_at);

-- Apelidos de nome já verificados por CPF (por cliente). Revogar = preencher revoked_at; nunca apagar.
CREATE TABLE IF NOT EXISTS exam_identity_aliases (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  alias_normalized TEXT NOT NULL,
  kinds JSONB,
  first_document_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_exam_identity_aliases_client_alias
  ON exam_identity_aliases (client_id, alias_normalized);
CREATE INDEX IF NOT EXISTS ix_exam_identity_aliases_empresa ON exam_identity_aliases (empresa_id, client_id);

-- Matriz de regras por clínica, versionada: cada mudança é uma linha nova (nunca UPDATE/DELETE).
CREATE TABLE IF NOT EXISTS exam_identity_rule_sets (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  config JSONB NOT NULL,
  created_by INTEGER,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, version)
);
DROP TRIGGER IF EXISTS tg_exam_identity_rule_sets_imutavel ON exam_identity_rule_sets;
CREATE TRIGGER tg_exam_identity_rule_sets_imutavel
  BEFORE UPDATE OR DELETE ON exam_identity_rule_sets
  FOR EACH ROW EXECUTE FUNCTION exam_identity_checks_imutavel();
