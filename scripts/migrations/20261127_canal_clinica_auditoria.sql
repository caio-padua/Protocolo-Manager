-- Auditoria do canal oficial da clinica: quem, quando, antes e depois. Somente acrescenta linhas.
CREATE TABLE IF NOT EXISTS canal_clinica_auditoria (
  id              serial PRIMARY KEY,
  empresa_id      integer NOT NULL,
  client_id       integer NOT NULL,
  professional_id integer,
  acao            text NOT NULL,
  antes           boolean NOT NULL,
  depois          boolean NOT NULL,
  tinha_historico boolean NOT NULL DEFAULT false,
  confirmou_historico boolean NOT NULL DEFAULT false,
  em              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS canal_clinica_auditoria_cliente_idx ON canal_clinica_auditoria (client_id, em DESC);
