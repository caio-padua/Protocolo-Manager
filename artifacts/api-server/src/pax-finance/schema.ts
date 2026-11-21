import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/**
 * PAX FINANCE — esquema do domínio financeiro.
 * Fronteira: tabelas com prefixo fin_, dinheiro em centavos inteiros (bigint), datas tipadas,
 * company_id obrigatório (referência a empresas.id, sem copiar CNPJ).
 * Somente aditivo e idempotente. Nunca toca em payments nem em tabelas clínicas.
 * Cópia SQL: scripts/migrations/20261121_pax_finance_fundacao.sql (mesmo conteúdo).
 */
export const STATUS_REGRA = ["rascunho", "pendente", "aprovada", "ativa", "substituida"] as const;
export const ESFERAS = ["federal", "estadual", "municipal"] as const;
export const PAPEIS_SOCIETARIOS = ["socio", "administrador", "socio_administrador", "responsavel_tecnico", "procurador"] as const;

export const PAX_FINANCE_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS fin_audit_log (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES empresas(id),
    actor_id INTEGER,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id BIGINT,
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS fin_audit_log_company_idx ON fin_audit_log (company_id, created_at DESC)`,
  `CREATE OR REPLACE FUNCTION fin_block_mutation() RETURNS trigger AS $$
   BEGIN RAISE EXCEPTION 'PAX FINANCE: % em % nao e permitido (registro imutavel)', TG_OP, TG_TABLE_NAME; END;
   $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS fin_audit_log_imutavel ON fin_audit_log`,
  `CREATE TRIGGER fin_audit_log_imutavel BEFORE UPDATE OR DELETE ON fin_audit_log
     FOR EACH ROW EXECUTE FUNCTION fin_block_mutation()`,

  `CREATE TABLE IF NOT EXISTS fin_company_profile (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL UNIQUE REFERENCES empresas(id),
    regime_declarado TEXT,
    opcao_simples TEXT NOT NULL DEFAULT 'nao_verificada' CHECK (opcao_simples IN ('nao_verificada','confirmada','nao_optante')),
    fator_r_aplicavel BOOLEAN,
    municipio_iss TEXT,
    uf CHAR(2),
    capital_social_cents BIGINT CHECK (capital_social_cents IS NULL OR capital_social_cents >= 0),
    capital_social_origem TEXT,
    moeda CHAR(3) NOT NULL DEFAULT 'BRL',
    status_validacao TEXT NOT NULL DEFAULT 'rascunho' CHECK (status_validacao IN ('rascunho','validado')),
    validated_by INTEGER,
    validated_at TIMESTAMPTZ,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS fin_partner (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES empresas(id),
    nome TEXT NOT NULL,
    papel TEXT NOT NULL CHECK (papel IN ('socio','administrador','socio_administrador','responsavel_tecnico','procurador')),
    participacao_bp INTEGER CHECK (participacao_bp IS NULL OR participacao_bp BETWEEN 0 AND 10000),
    vigencia_inicio DATE,
    vigencia_fim DATE,
    origem TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','documento')),
    source_document_id BIGINT,
    status_validacao TEXT NOT NULL DEFAULT 'rascunho' CHECK (status_validacao IN ('rascunho','validado')),
    validated_by INTEGER,
    validated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (vigencia_fim IS NULL OR vigencia_inicio IS NULL OR vigencia_fim >= vigencia_inicio)
  )`,
  `CREATE INDEX IF NOT EXISTS fin_partner_company_idx ON fin_partner (company_id)`,

  `CREATE TABLE IF NOT EXISTS fin_tax_rule (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES empresas(id),
    rule_key TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version >= 1),
    tributo TEXT NOT NULL,
    esfera TEXT NOT NULL CHECK (esfera IN ('federal','estadual','municipal')),
    municipio TEXT,
    regime TEXT,
    anexo TEXT,
    cnae TEXT,
    base TEXT,
    aliquota_pct NUMERIC(12,6) CHECK (aliquota_pct IS NULL OR (aliquota_pct >= 0 AND aliquota_pct <= 100)),
    parcela_deduzir_cents BIGINT CHECK (parcela_deduzir_cents IS NULL OR parcela_deduzir_cents >= 0),
    limite_min_cents BIGINT CHECK (limite_min_cents IS NULL OR limite_min_cents >= 0),
    limite_max_cents BIGINT CHECK (limite_max_cents IS NULL OR limite_max_cents >= 0),
    params JSONB NOT NULL DEFAULT '{}'::jsonb,
    fonte_oficial TEXT,
    fonte_url TEXT,
    fonte_consultada_em DATE,
    vigencia_inicio DATE NOT NULL,
    vigencia_fim DATE,
    status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','pendente','aprovada','ativa','substituida')),
    responsavel_id INTEGER,
    aprovador_id INTEGER,
    aprovado_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, rule_key, version),
    CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio),
    CHECK (limite_min_cents IS NULL OR limite_max_cents IS NULL OR limite_max_cents >= limite_min_cents),
    CHECK (status NOT IN ('aprovada','ativa','substituida') OR (
      fonte_oficial IS NOT NULL AND fonte_url IS NOT NULL AND fonte_consultada_em IS NOT NULL
      AND aprovador_id IS NOT NULL AND aprovado_em IS NOT NULL))
  )`,
  `CREATE INDEX IF NOT EXISTS fin_tax_rule_lookup_idx ON fin_tax_rule (company_id, rule_key, status)`,
  `CREATE OR REPLACE FUNCTION fin_tax_rule_guarda() RETURNS trigger AS $$
   BEGIN
     IF TG_OP = 'DELETE' THEN
       RAISE EXCEPTION 'PAX FINANCE: regra tributaria nao pode ser apagada (preserve o historico)';
     END IF;
     IF OLD.status IN ('aprovada','ativa','substituida') AND
        ROW(NEW.company_id, NEW.rule_key, NEW.version, NEW.tributo, NEW.esfera, NEW.municipio, NEW.regime, NEW.anexo, NEW.cnae,
            NEW.base, NEW.aliquota_pct, NEW.parcela_deduzir_cents, NEW.limite_min_cents, NEW.limite_max_cents, NEW.params,
            NEW.fonte_oficial, NEW.fonte_url, NEW.fonte_consultada_em, NEW.vigencia_inicio, NEW.aprovador_id, NEW.aprovado_em)
        IS DISTINCT FROM
        ROW(OLD.company_id, OLD.rule_key, OLD.version, OLD.tributo, OLD.esfera, OLD.municipio, OLD.regime, OLD.anexo, OLD.cnae,
            OLD.base, OLD.aliquota_pct, OLD.parcela_deduzir_cents, OLD.limite_min_cents, OLD.limite_max_cents, OLD.params,
            OLD.fonte_oficial, OLD.fonte_url, OLD.fonte_consultada_em, OLD.vigencia_inicio, OLD.aprovador_id, OLD.aprovado_em) THEN
       RAISE EXCEPTION 'PAX FINANCE: regra aprovada e imutavel; crie uma nova versao';
     END IF;
     RETURN NEW;
   END; $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS fin_tax_rule_guarda_trg ON fin_tax_rule`,
  `CREATE TRIGGER fin_tax_rule_guarda_trg BEFORE UPDATE OR DELETE ON fin_tax_rule
     FOR EACH ROW EXECUTE FUNCTION fin_tax_rule_guarda()`,
];

let ready: Promise<void> | null = null;
export async function ensurePaxFinanceSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const s of PAX_FINANCE_DDL) await db.execute(sql.raw(s));
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}
