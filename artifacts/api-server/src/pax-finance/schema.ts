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
/** Papeis aceitos para NOVAS pessoas. "responsavel_tecnico" continua permitido no CHECK do banco so por linhas legadas: medico responsavel clinico nao e socio nem responsavel juridico/financeiro. */
export const PAPEIS_SOCIETARIOS = ["socio", "administrador", "socio_administrador", "procurador"] as const;

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
  // ---- Onda 2: multi-CNPJ, metas, credito e livro-caixa (somente aditivo) ----
  `CREATE TABLE IF NOT EXISTS fin_entity (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES empresas(id),
    cnpj TEXT NOT NULL,
    razao_social TEXT NOT NULL,
    nome_fantasia TEXT,
    data_constituicao DATE,
    natureza_juridica TEXT,
    porte TEXT,
    capital_social_cents BIGINT CHECK (capital_social_cents IS NULL OR capital_social_cents >= 0),
    capital_integralizado BOOLEAN,
    sede JSONB NOT NULL DEFAULT '{}'::jsonb,
    cnae_principal TEXT,
    cnae_principal_descricao TEXT,
    cnaes_secundarios JSONB NOT NULL DEFAULT '[]'::jsonb,
    regime_efetivo TEXT,
    opcao_simples TEXT NOT NULL DEFAULT 'nao_verificada' CHECK (opcao_simples IN ('nao_verificada','confirmada','nao_optante')),
    inscricao_municipal TEXT,
    inscricao_estadual TEXT,
    origem_campos JSONB NOT NULL DEFAULT '{}'::jsonb,
    status_validacao TEXT NOT NULL DEFAULT 'rascunho' CHECK (status_validacao IN ('rascunho','validado')),
    validated_by INTEGER,
    validated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, cnpj)
  )`,
  `ALTER TABLE fin_partner ADD COLUMN IF NOT EXISTS entity_id BIGINT REFERENCES fin_entity(id)`,
  `ALTER TABLE fin_partner ADD COLUMN IF NOT EXISTS registro_profissional TEXT`,
  `ALTER TABLE fin_partner ADD COLUMN IF NOT EXISTS origem_doc JSONB NOT NULL DEFAULT '{}'::jsonb`,
  `CREATE INDEX IF NOT EXISTS fin_partner_entity_idx ON fin_partner (company_id, entity_id)`,

  `CREATE TABLE IF NOT EXISTS fin_goal (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES empresas(id),
    tipo TEXT NOT NULL CHECK (tipo IN ('faturamento','credito')),
    period_type TEXT NOT NULL CHECK (period_type IN ('month','quarter','semester','year','rolling12')),
    period_key TEXT NOT NULL,
    target_cents BIGINT NOT NULL CHECK (target_cents > 0),
    titulo TEXT,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, tipo, period_type, period_key)
  )`,
  `CREATE TABLE IF NOT EXISTS fin_goal_milestone (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES empresas(id),
    ordem INTEGER NOT NULL CHECK (ordem BETWEEN 1 AND 4),
    nome TEXT NOT NULL,
    valor_mensal_cents BIGINT NOT NULL CHECK (valor_mensal_cents > 0),
    note TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, ordem)
  )`,
  `CREATE TABLE IF NOT EXISTS fin_credit_line (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES empresas(id),
    line_key TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version >= 1),
    nome TEXT NOT NULL,
    etapa TEXT NOT NULL DEFAULT 'meta_interna' CHECK (etapa IN ('meta_interna','requisito_preliminar','simulacao','pre_analise_bancaria','aprovacao_formal')),
    conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'aguardando_verificacao' CHECK (status IN ('aguardando_verificacao','verificada')),
    fonte_oficial TEXT,
    fonte_url TEXT,
    verificada_em DATE,
    created_by INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, line_key, version),
    CHECK (status <> 'verificada' OR (fonte_oficial IS NOT NULL AND fonte_url IS NOT NULL AND verificada_em IS NOT NULL))
  )`,

  `CREATE TABLE IF NOT EXISTS fin_ledger_entry (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES empresas(id),
    entity_id BIGINT REFERENCES fin_entity(id),
    tipo TEXT NOT NULL CHECK (tipo IN ('receita','despesa','guia')),
    descricao TEXT NOT NULL,
    valor_cents BIGINT NOT NULL CHECK (valor_cents > 0),
    competencia DATE NOT NULL,
    data_caixa DATE,
    status TEXT NOT NULL DEFAULT 'previsto' CHECK (status IN ('previsto','realizado','cancelado')),
    origem TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual')),
    created_by INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (status <> 'realizado' OR data_caixa IS NOT NULL)
  )`,
  `CREATE INDEX IF NOT EXISTS fin_ledger_company_idx ON fin_ledger_entry (company_id, competencia DESC)`,

  `CREATE TABLE IF NOT EXISTS fin_legacy_goal (
    legacy_id INTEGER PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'legado_nao_atribuido',
    registrado_em TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `DO $$ BEGIN
     IF to_regclass('public.financial_goals') IS NOT NULL THEN
       INSERT INTO fin_legacy_goal (legacy_id) SELECT id FROM financial_goals ON CONFLICT DO NOTHING;
     END IF;
   END $$`,

  // Onda 3 (aditivo): nomes de exibicao, camada de cenario DEMO separada do real e configuracao do produto por empresa.
  `ALTER TABLE fin_entity ADD COLUMN IF NOT EXISTS aliases JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE fin_entity ADD COLUMN IF NOT EXISTS nome_fantasia_preferencial TEXT`,
  `CREATE TABLE IF NOT EXISTS fin_scenario_month (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES empresas(id),
    scenario_type TEXT NOT NULL CHECK (scenario_type = 'DEMO'),
    ano INTEGER NOT NULL CHECK (ano BETWEEN 2000 AND 2100),
    mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
    natureza TEXT NOT NULL CHECK (natureza IN ('simulacao','projecao')),
    valor_cents BIGINT NOT NULL CHECK (valor_cents >= 0),
    label TEXT NOT NULL DEFAULT 'DADOS FICTÍCIOS — SIMULAÇÃO — NÃO SÃO FATURAMENTO REAL',
    updated_by INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, scenario_type, ano, mes)
  )`,
  `CREATE TABLE IF NOT EXISTS fin_tenant_config (
    company_id INTEGER PRIMARY KEY REFERENCES empresas(id),
    produto TEXT NOT NULL DEFAULT 'pax_finance',
    flags JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by INTEGER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  // Laboratorio de 24 meses (aditivo): simulacao isolada; is_simulation so pode ser verdadeiro.
  `CREATE TABLE IF NOT EXISTS fin_sim_scenario (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES empresas(id),
    scenario_id TEXT NOT NULL DEFAULT 'lab-24m',
    is_simulation BOOLEAN NOT NULL DEFAULT true CHECK (is_simulation = true),
    premissas JSONB NOT NULL,
    overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
    label TEXT NOT NULL DEFAULT 'AMBIENTE DE APRENDIZADO — SIMULAÇÃO — NÃO REPRESENTA FATURAMENTO REAL',
    updated_by INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, scenario_id)
  )`,
  // Conformidade societaria (aditivo): beneficiario final, controle efetivo e partes relacionadas. Nunca guarda CPF/RG; encerrar, nao apagar.
  `CREATE TABLE IF NOT EXISTS fin_related_party (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES empresas(id),
    entity_id BIGINT NOT NULL REFERENCES fin_entity(id),
    tipo TEXT NOT NULL CHECK (tipo IN ('beneficiario_final','controle_efetivo','parte_relacionada')),
    nome TEXT NOT NULL,
    tipo_pessoa TEXT NOT NULL CHECK (tipo_pessoa IN ('fisica','juridica')),
    cnpj TEXT,
    participacao_bp INTEGER CHECK (participacao_bp IS NULL OR participacao_bp BETWEEN 0 AND 10000),
    via TEXT NOT NULL CHECK (via IN ('direta','indireta','contrato','procuracao','familiar','mesmo_grupo','administrador_de_fato')),
    fonte_documento TEXT,
    observacao TEXT,
    status_validacao TEXT NOT NULL DEFAULT 'rascunho' CHECK (status_validacao IN ('rascunho','validado')),
    validated_by INTEGER,
    validated_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_by INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (tipo <> 'beneficiario_final' OR tipo_pessoa = 'fisica')
  )`,
  `CREATE INDEX IF NOT EXISTS fin_related_party_entity_idx ON fin_related_party (company_id, entity_id)`,
  // Documentos oficiais (aditivo): um arquivo por ato oficial; dados pessoais sensiveis ficam cifrados; nada e apagado (substituido/rejeitado).
  `CREATE TABLE IF NOT EXISTS fin_doc_import (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES empresas(id),
    slot TEXT NOT NULL CHECK (slot IN ('cnpj_rfb','certidao_jucesp','contrato_social')),
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL CHECK (file_size > 0),
    sha256 TEXT NOT NULL,
    file_bytes BYTEA NOT NULL,
    metodo TEXT NOT NULL CHECK (metodo IN ('texto','visao_ia')),
    campos JSONB NOT NULL DEFAULT '{}'::jsonb,
    sensiveis JSONB NOT NULL DEFAULT '{}'::jsonb,
    conferencia JSONB NOT NULL DEFAULT '{}'::jsonb,
    avisos JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'extraido' CHECK (status IN ('extraido','aplicado','substituido','rejeitado')),
    uploaded_by INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_by INTEGER,
    applied_at TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS fin_doc_import_company_idx ON fin_doc_import (company_id, slot, id DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS fin_doc_import_hash_uq ON fin_doc_import (company_id, slot, sha256) WHERE status IN ('extraido','aplicado')`,
  `CREATE TABLE IF NOT EXISTS fin_company_registry (
    company_id INTEGER PRIMARY KEY REFERENCES empresas(id),
    dados JSONB NOT NULL DEFAULT '{}'::jsonb,
    sensiveis JSONB NOT NULL DEFAULT '{}'::jsonb,
    origem JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by INTEGER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS fin_cnae_catalogo (
    codigo TEXT PRIMARY KEY CHECK (codigo ~ '^[0-9]{2}\\.[0-9]{2}-[0-9]-[0-9]{2}$'),
    descricao TEXT NOT NULL,
    divisao TEXT,
    area_saude TEXT,
    busca TEXT NOT NULL,
    origem TEXT NOT NULL DEFAULT 'ibge' CHECK (origem IN ('ibge','manual')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS fin_cnae_catalogo_area ON fin_cnae_catalogo (area_saude)`,
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
