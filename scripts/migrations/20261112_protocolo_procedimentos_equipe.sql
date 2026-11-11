-- Protocolo por PROCEDIMENTO com equipe (ate 3 participantes) e reserva conjunta por ocorrencia.
-- Aditiva: nao altera nem apaga protocolos, sessoes ou procedimentos existentes. Execucao explicita (nao roda no boot).
CREATE TABLE IF NOT EXISTS protocolo_procedimentos (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  protocol_id INTEGER NOT NULL REFERENCES protocols(id),
  procedimento_id INTEGER NOT NULL REFERENCES procedimentos_clinicos(id),
  ordem INTEGER NOT NULL DEFAULT 1,
  total_sessoes INTEGER NOT NULL DEFAULT 1 CHECK (total_sessoes BETWEEN 1 AND 365),
  intervalo_dias INTEGER NOT NULL DEFAULT 7 CHECK (intervalo_dias BETWEEN 0 AND 365),
  data_inicio TEXT,
  nome_snapshot TEXT NOT NULL,
  duracao_segundos INTEGER NOT NULL CHECK (duracao_segundos BETWEEN 1 AND 86400),
  produto_id INTEGER REFERENCES substances(id),
  dose TEXT,
  equipe_origem TEXT NOT NULL CHECK (equipe_origem IN ('padrao_procedimento','prescritor')),
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','cancelado')),
  criado_por INTEGER REFERENCES professionals(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS protocolo_procedimentos_protocolo_idx ON protocolo_procedimentos (protocol_id, ordem, id);

CREATE TABLE IF NOT EXISTS protocolo_procedimento_equipe (
  id SERIAL PRIMARY KEY,
  protocolo_procedimento_id INTEGER NOT NULL REFERENCES protocolo_procedimentos(id),
  ordem INTEGER NOT NULL CHECK (ordem BETWEEN 1 AND 3),
  category_id INTEGER NOT NULL REFERENCES professional_areas(id),
  -- Categorias alternativas da MESMA necessidade (ex.: medico OU biomedico): atende uma pessoa, nao as duas.
  alternative_category_ids INTEGER[] NOT NULL DEFAULT '{}',
  location_id INTEGER REFERENCES locations(id),
  professional_ids INTEGER[] NOT NULL DEFAULT '{}',
  UNIQUE (protocolo_procedimento_id, ordem)
);

CREATE TABLE IF NOT EXISTS protocolo_ocorrencias (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  protocolo_procedimento_id INTEGER NOT NULL REFERENCES protocolo_procedimentos(id),
  client_id INTEGER NOT NULL REFERENCES clients(id),
  numero INTEGER NOT NULL CHECK (numero >= 1),
  scheduled_date TEXT NOT NULL,
  scheduled_time TEXT NOT NULL,
  duracao_segundos INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'reservada' CHECK (status IN ('reservada','cancelada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS protocolo_ocorrencias_numero_viva_uq
  ON protocolo_ocorrencias (protocolo_procedimento_id, numero) WHERE status = 'reservada';

CREATE TABLE IF NOT EXISTS protocolo_ocorrencia_participantes (
  ocorrencia_id INTEGER NOT NULL REFERENCES protocolo_ocorrencias(id),
  ordem INTEGER NOT NULL CHECK (ordem BETWEEN 1 AND 3),
  category_id INTEGER NOT NULL REFERENCES professional_areas(id),
  professional_id INTEGER REFERENCES professionals(id),
  resource_id INTEGER NOT NULL REFERENCES agenda_resources(id),
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  PRIMARY KEY (ocorrencia_id, ordem)
);

-- Categorias alternativas na equipe PADRAO do procedimento (configuracao da clinica; nao afirma habilitacao profissional).
CREATE TABLE IF NOT EXISTS procedimento_equipes_alternativas (
  equipe_id INTEGER NOT NULL REFERENCES procedimento_equipes(id),
  area_id INTEGER NOT NULL REFERENCES professional_areas(id),
  PRIMARY KEY (equipe_id, area_id)
);

-- Agenda nova nao liga a registro de local: a clinica dona fica na propria agenda (tambem criada no boot, aditivo).
ALTER TABLE agenda_resources ADD COLUMN IF NOT EXISTS empresa_id INTEGER;
UPDATE agenda_resources r SET empresa_id=l.empresa_id FROM locations l
  WHERE l.id=r.location_id AND r.empresa_id IS NULL AND l.empresa_id IS NOT NULL;
