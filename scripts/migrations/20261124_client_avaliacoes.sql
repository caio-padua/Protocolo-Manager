-- Medicoes corporais do cliente (Cockpit: bioimpedancia, antropometria, dinamometria,
-- calorimetria, ultrassom e outras avaliacoes). Remover = deleted_at; nada e apagado.
CREATE TABLE IF NOT EXISTS client_avaliacoes (
  id serial PRIMARY KEY,
  client_id integer NOT NULL,
  empresa_id integer NOT NULL,
  tipo text NOT NULL,
  data_avaliacao text NOT NULL,
  valores jsonb NOT NULL,
  observacoes text,
  criado_por integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS client_avaliacoes_cliente_tipo_idx
  ON client_avaliacoes (client_id, tipo, data_avaliacao);
