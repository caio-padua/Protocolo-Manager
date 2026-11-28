-- HOME CARE (quarta forma de atendimento), auditoria do Pit Stop, reconciliacao de agendas com o Google,
-- habilitacao de enfermagem, preferencia de profissional por agenda e documentos de profissionais.
-- Aditiva e idempotente: nao apaga nem funde locais, agendas, protocolos ou sessoes. Execucao explicita (nao roda no boot).
-- Aplicar so em desenvolvimento ou banco isolado ate nova ordem escrita do CEO.

-- 1) Forma Home Care. Valor gravado: home_care. Atende no endereco do paciente (ou outro endereco domiciliar informado na visita).
ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_agenda_papel_check;
ALTER TABLE locations ADD CONSTRAINT locations_agenda_papel_check
  CHECK (agenda_papel IS NULL OR agenda_papel IN ('local','online','externo','home_care','pessoal','geral'));
ALTER TABLE protocolo_procedimento_equipe DROP CONSTRAINT IF EXISTS protocolo_equipe_modalidade_chk;
ALTER TABLE protocolo_procedimento_equipe ADD CONSTRAINT protocolo_equipe_modalidade_chk
  CHECK (modalidade IN ('local','online','externo','home_care'));

-- 2) Endereco de CADA visita Home Care. NULL = ainda nao definido; a tela sugere o endereco do paciente, mas o gravado
--    so existe depois de a pessoa confirmar (origem 'paciente' = copiado do cadastro, 'informado' = digitado para a visita).
ALTER TABLE agendamento_plano_ocorrencias ADD COLUMN IF NOT EXISTS endereco_visita TEXT;
ALTER TABLE agendamento_plano_ocorrencias ADD COLUMN IF NOT EXISTS endereco_visita_origem TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plano_ocorrencia_endereco_origem_chk') THEN
    ALTER TABLE agendamento_plano_ocorrencias ADD CONSTRAINT plano_ocorrencia_endereco_origem_chk
      CHECK (endereco_visita_origem IS NULL OR endereco_visita_origem IN ('paciente','informado'));
  END IF;
END $$;

-- 3) Auditoria do plano: quem fez o que (assumir, editar, confirmar, enviar ao Google), por empresa.
CREATE TABLE IF NOT EXISTS agendamento_plano_auditoria (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  plano_id INTEGER NOT NULL REFERENCES agendamento_planos(id),
  ator_id INTEGER REFERENCES professionals(id),
  acao TEXT NOT NULL,
  detalhe JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS agendamento_plano_auditoria_plano_idx ON agendamento_plano_auditoria (plano_id, id);

-- 4) Trilha da reconciliacao de agendas com o Google (nome antes/depois, pelo identificador estavel do calendario).
CREATE TABLE IF NOT EXISTS agenda_google_reconciliacoes (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  ator_id INTEGER REFERENCES professionals(id),
  acao TEXT NOT NULL CHECK (acao IN ('renomeou_agenda','renomeou_local','criou_agenda','ignorou')),
  agenda_id INTEGER REFERENCES agenda_resources(id),
  location_id INTEGER REFERENCES locations(id),
  google_calendar_id TEXT NOT NULL,
  nome_antes TEXT,
  nome_depois TEXT,
  detalhe JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS agenda_google_reconciliacoes_empresa_idx ON agenda_google_reconciliacoes (empresa_id, id);

-- 5) Habilitacao de enfermagem. Carteira de TECNICA nao e de enfermeira: o nivel e gravado como veio no documento e a
--    situacao do registro no conselho NAO e presumida (nao_verificada ate haver conferencia em fonte apropriada).
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS habilitacao_nivel TEXT;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS situacao_registro TEXT NOT NULL DEFAULT 'nao_verificada';
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS situacao_registro_fonte TEXT;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS situacao_registro_em TIMESTAMPTZ;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'professionals_habilitacao_nivel_chk') THEN
    ALTER TABLE professionals ADD CONSTRAINT professionals_habilitacao_nivel_chk
      CHECK (habilitacao_nivel IS NULL OR habilitacao_nivel IN ('enfermeiro','tecnico_enfermagem','auxiliar_enfermagem'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'professionals_situacao_registro_chk') THEN
    ALTER TABLE professionals ADD CONSTRAINT professionals_situacao_registro_chk
      CHECK (situacao_registro IN ('nao_verificada','verificada','irregular'));
  END IF;
END $$;

-- 6) Requisito de nivel na equipe: NULL = qualquer profissional da categoria; 'enfermeiro' = so quem tem nivel enfermeiro gravado.
ALTER TABLE procedimento_equipes ADD COLUMN IF NOT EXISTS exige_nivel TEXT;
ALTER TABLE protocolo_procedimento_equipe ADD COLUMN IF NOT EXISTS exige_nivel TEXT;
ALTER TABLE protocolo_procedimento_equipe ADD COLUMN IF NOT EXISTS profissional_origem TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'procedimento_equipes_exige_nivel_chk') THEN
    ALTER TABLE procedimento_equipes ADD CONSTRAINT procedimento_equipes_exige_nivel_chk CHECK (exige_nivel IS NULL OR exige_nivel IN ('enfermeiro'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'protocolo_equipe_exige_nivel_chk') THEN
    ALTER TABLE protocolo_procedimento_equipe ADD CONSTRAINT protocolo_equipe_exige_nivel_chk CHECK (exige_nivel IS NULL OR exige_nivel IN ('enfermeiro'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'protocolo_equipe_prof_origem_chk') THEN
    ALTER TABLE protocolo_procedimento_equipe ADD CONSTRAINT protocolo_equipe_prof_origem_chk CHECK (profissional_origem IS NULL OR profissional_origem IN ('preferencia','escolhido'));
  END IF;
END $$;

-- 7) Preferencia de profissional por agenda (ex.: quem a clinica prefere no Home Care de enfermagem). Sugestao editavel, nunca imposicao.
CREATE TABLE IF NOT EXISTS agenda_profissionais_preferidos (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  agenda_id INTEGER NOT NULL REFERENCES agenda_resources(id),
  professional_id INTEGER NOT NULL REFERENCES professionals(id),
  criado_por INTEGER REFERENCES professionals(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agenda_id, professional_id)
);

-- 8) Documentos de profissionais. Arquivo no armazenamento privado; aqui ficam so metadados. Nunca se apaga: arquiva-se.
CREATE TABLE IF NOT EXISTS profissional_documentos (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  professional_id INTEGER NOT NULL REFERENCES professionals(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('carteira_conselho','comprovante_endereco','documento_identidade','diploma_certificado','contrato','outro')),
  titulo TEXT NOT NULL,
  nome_original TEXT NOT NULL,
  mime TEXT NOT NULL,
  tamanho_bytes INTEGER NOT NULL CHECK (tamanho_bytes > 0),
  sha256 TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  situacao TEXT NOT NULL DEFAULT 'pendente_confirmacao'
    CHECK (situacao IN ('pendente_confirmacao','confirmado','titular_divergente','arquivado')),
  titular_declarado TEXT,
  observacao TEXT,
  enviado_por INTEGER REFERENCES professionals(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  arquivado_em TIMESTAMPTZ,
  arquivado_por INTEGER REFERENCES professionals(id)
);
CREATE INDEX IF NOT EXISTS profissional_documentos_prof_idx ON profissional_documentos (empresa_id, professional_id, id);
-- Mesmo arquivo (hash) no mesmo profissional nao entra duas vezes enquanto estiver ativo.
CREATE UNIQUE INDEX IF NOT EXISTS profissional_documentos_hash_uq
  ON profissional_documentos (professional_id, sha256) WHERE situacao <> 'arquivado';

CREATE TABLE IF NOT EXISTS profissional_documento_dados (
  id SERIAL PRIMARY KEY,
  documento_id INTEGER NOT NULL REFERENCES profissional_documentos(id),
  campo TEXT NOT NULL,
  valor TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sugerido' CHECK (status IN ('sugerido','aceito','recusado')),
  valor_anterior TEXT,
  revisado_por INTEGER REFERENCES professionals(id),
  revisado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (documento_id, campo)
);

CREATE TABLE IF NOT EXISTS profissional_documento_auditoria (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  documento_id INTEGER REFERENCES profissional_documentos(id),
  professional_id INTEGER NOT NULL REFERENCES professionals(id),
  ator_id INTEGER REFERENCES professionals(id),
  acao TEXT NOT NULL,
  detalhe JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS profissional_documento_auditoria_prof_idx ON profissional_documento_auditoria (professional_id, id);
