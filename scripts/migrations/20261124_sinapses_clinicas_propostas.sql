-- Tabela aditiva para propostas editáveis de data binding clínico.
-- Ligações operacionais continuam em sinapses_clinicas e só recebem linhas
-- após aprovação explícita. A migração do projeto é aplicada pelo post-merge.
CREATE TABLE IF NOT EXISTS sinapses_clinicas_propostas (
  id SERIAL PRIMARY KEY,
  pergunta_id TEXT NOT NULL,
  categoria TEXT NOT NULL,
  destino_tipo TEXT NOT NULL,
  destino_id INTEGER NOT NULL,
  eixo TEXT NOT NULL,
  justificativa TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE', 'APROVADA', 'RECUSADA')),
  criado_por INTEGER,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sinapses_clinicas_propostas_uk
    UNIQUE (pergunta_id, categoria, destino_tipo, destino_id)
);
CREATE INDEX IF NOT EXISTS sinapses_clinicas_propostas_status_idx
  ON sinapses_clinicas_propostas (status, id);
