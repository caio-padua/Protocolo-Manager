-- PIT STOP: plano de agendamento compartilhado entre o medico (prescritor) e a recepcao/enfermagem.
-- Aditiva e idempotente: nao altera nem apaga protocolos, sessoes, agendas, locais ou procedimentos existentes.
-- Execucao explicita (nao roda no boot). Aplicar so em desenvolvimento ou banco isolado ate nova ordem do CEO.

-- 1) Equipe do procedimento no protocolo: modalidade (Sede/Online/Externo) e agenda escolhida, com a origem da escolha.
--    modalidade: local = Sede da empresa; online = sem endereco fisico; externo = fora da sede.
ALTER TABLE protocolo_procedimento_equipe ADD COLUMN IF NOT EXISTS modalidade TEXT NOT NULL DEFAULT 'local';
ALTER TABLE protocolo_procedimento_equipe ADD COLUMN IF NOT EXISTS agenda_id INTEGER REFERENCES agenda_resources(id);
ALTER TABLE protocolo_procedimento_equipe ADD COLUMN IF NOT EXISTS agenda_origem TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'protocolo_equipe_modalidade_chk') THEN
    ALTER TABLE protocolo_procedimento_equipe ADD CONSTRAINT protocolo_equipe_modalidade_chk
      CHECK (modalidade IN ('local','online','externo'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'protocolo_equipe_agenda_origem_chk') THEN
    ALTER TABLE protocolo_procedimento_equipe ADD CONSTRAINT protocolo_equipe_agenda_origem_chk
      CHECK (agenda_origem IS NULL OR agenda_origem IN ('sugerida','escolhida'));
  END IF;
END $$;

-- 2) Origem da equipe padrao do procedimento (de onde veio o requisito de profissional).
--    NULL = origem nao registrada (equipes antigas); nada e inventado para elas.
ALTER TABLE procedimento_equipes ADD COLUMN IF NOT EXISTS origem TEXT;

-- 3) Plano de agendamento (o "estado compartilhado" do Pit Stop): um plano vivo por protocolo.
CREATE TABLE IF NOT EXISTS agendamento_planos (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  protocol_id INTEGER NOT NULL REFERENCES protocols(id),
  client_id INTEGER NOT NULL REFERENCES clients(id),
  estado TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente','em_revisao','confirmado','cancelado')),
  prescritor_id INTEGER REFERENCES professionals(id),
  criado_por INTEGER REFERENCES professionals(id),
  revisor_id INTEGER REFERENCES professionals(id),
  revisao_expira_em TIMESTAMPTZ,
  confirmado_por INTEGER REFERENCES professionals(id),
  confirmado_em TIMESTAMPTZ,
  -- Sincronizacao com o Google Agenda: so vira 'sincronizado' quando TODAS as visitas foram confirmadas pelo Google.
  sync_estado TEXT NOT NULL DEFAULT 'nao_iniciada' CHECK (sync_estado IN ('nao_iniciada','sincronizado','parcial','erro')),
  sync_detalhe JSONB,
  sync_em TIMESTAMPTZ,
  versao INTEGER NOT NULL DEFAULT 1,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS agendamento_planos_protocolo_vivo_uq
  ON agendamento_planos (protocol_id) WHERE estado IN ('pendente','em_revisao','confirmado');
CREATE INDEX IF NOT EXISTS agendamento_planos_empresa_estado_idx ON agendamento_planos (empresa_id, estado, id);

-- 4) Datas e horarios PROPOSTOS (ainda sem reserva). A reserva so nasce na confirmacao explicita.
CREATE TABLE IF NOT EXISTS agendamento_plano_ocorrencias (
  id SERIAL PRIMARY KEY,
  plano_id INTEGER NOT NULL REFERENCES agendamento_planos(id),
  protocolo_procedimento_id INTEGER NOT NULL REFERENCES protocolo_procedimentos(id),
  numero INTEGER NOT NULL CHECK (numero >= 1),
  data TEXT,
  hora TEXT,
  origem TEXT NOT NULL DEFAULT 'automatica' CHECK (origem IN ('automatica','manual')),
  motivo TEXT,
  ocorrencia_id INTEGER REFERENCES protocolo_ocorrencias(id),
  UNIQUE (plano_id, protocolo_procedimento_id, numero)
);

-- 5) Preenche a origem SOMENTE das equipes geradas automaticamente a partir de substancias (a descricao do procedimento
--    registra isso). Equipes configuradas a mao continuam com origem NULL: nada e presumido.
UPDATE procedimento_equipes e SET origem = CASE a.slug WHEN 'medicina' THEN 'substancia_participacao_medica' ELSE 'substancia_enfermagem' END
  FROM procedimentos_clinicos p, professional_areas a
 WHERE e.origem IS NULL AND p.id = e.procedimento_id AND a.id = e.area_id
   AND p.descricao LIKE 'Gerado automaticamente da substância #%' AND a.slug IN ('medicina','enfermagem');
