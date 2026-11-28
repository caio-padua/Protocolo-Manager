-- Precificação por categoria + estoque estático/dinâmico (reserva por protocolo).
-- Aditiva e idempotente (Regra de Ouro: nunca DROP/DELETE). Pode rodar mais de uma vez.

-- 1) Parâmetros de custos e encargos (uma linha por clínica). Zero = ainda não preenchido.
CREATE TABLE IF NOT EXISTS precificacao_parametros (
  empresa_id      integer PRIMARY KEY REFERENCES empresas(id),
  frete_pct       numeric(5,2) NOT NULL DEFAULT 0,
  perda_pct       numeric(5,2) NOT NULL DEFAULT 0,
  impostos_pct    numeric(5,2) NOT NULL DEFAULT 0,
  cartao_pct      numeric(5,2) NOT NULL DEFAULT 0,
  comissao_pct    numeric(5,2) NOT NULL DEFAULT 0,
  despesas_pct    numeric(5,2) NOT NULL DEFAULT 0,
  arredondamento  text NOT NULL DEFAULT 'nenhum',
  referencia_modo text NOT NULL DEFAULT 'maior',
  atualizado_por  integer,
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT precificacao_parametros_faixa_ck CHECK (
    frete_pct BETWEEN 0 AND 95 AND perda_pct BETWEEN 0 AND 95 AND impostos_pct BETWEEN 0 AND 95 AND
    cartao_pct BETWEEN 0 AND 95 AND comissao_pct BETWEEN 0 AND 95 AND despesas_pct BETWEEN 0 AND 95),
  CONSTRAINT precificacao_parametros_arred_ck CHECK (arredondamento IN ('nenhum','inteiro','90')),
  CONSTRAINT precificacao_parametros_ref_ck CHECK (referencia_modo IN ('maior','media','menor'))
);

-- 2) Margem por categoria e interruptor (auto = preço acompanha; congelado = preço parado).
CREATE TABLE IF NOT EXISTS precificacao_categorias (
  empresa_id     integer NOT NULL REFERENCES empresas(id),
  categoria      text NOT NULL,
  margem_pct     numeric(5,2) NOT NULL DEFAULT 0,
  modo           text NOT NULL DEFAULT 'congelado',
  atualizado_por integer,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, categoria),
  CONSTRAINT precificacao_categorias_cat_ck CHECK (categoria IN ('IM','SC','IMPLANTE','OUTRAS','SEM_VIA')),
  CONSTRAINT precificacao_categorias_margem_ck CHECK (margem_pct BETWEEN 0 AND 95),
  CONSTRAINT precificacao_categorias_modo_ck CHECK (modo IN ('auto','congelado'))
);

-- 3) Preço de venda publicado por apresentação (é o que o "congelado" preserva).
CREATE TABLE IF NOT EXISTS preco_publicado (
  empresa_id                 integer NOT NULL,
  variante_id                integer NOT NULL,
  preco_centavos             integer NOT NULL,
  custo_referencia_centavos  integer,
  margem_pct                 numeric(5,2),
  origem                     text NOT NULL,
  publicado_em               timestamptz NOT NULL DEFAULT now(),
  publicado_por              integer,
  PRIMARY KEY (empresa_id, variante_id),
  CONSTRAINT preco_publicado_valores_ck CHECK (preco_centavos >= 0 AND origem IN ('auto','aplicar_agora','congelamento'))
);

-- 4) Histórico append-only: toda mudança de preço (matriz, orçamento ou substância) deixa rastro.
CREATE TABLE IF NOT EXISTS preco_publicado_historico (
  id             serial PRIMARY KEY,
  empresa_id     integer NOT NULL,
  variante_id    integer NOT NULL,
  alvo           text NOT NULL,
  alvo_id        integer,
  antes_centavos integer,
  depois_centavos integer NOT NULL,
  origem         text NOT NULL,
  criado_por     integer,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT preco_publicado_historico_alvo_ck CHECK (alvo IN ('matriz','orcamento','substancia'))
);
CREATE INDEX IF NOT EXISTS preco_publicado_historico_variante_idx ON preco_publicado_historico (empresa_id, variante_id, criado_em DESC);

-- 5) Reserva de estoque por item de protocolo (o "dinâmico").
CREATE TABLE IF NOT EXISTS estoque_reservas (
  id                    serial PRIMARY KEY,
  empresa_id            integer NOT NULL,
  protocol_id           integer NOT NULL,
  protocol_item_id      integer NOT NULL,
  client_id             integer,
  substance_id          integer NOT NULL,
  quantidade_reservada  integer NOT NULL,
  quantidade_consumida  integer NOT NULL DEFAULT 0,
  quantidade_liberada   integer NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'ativa',
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estoque_reservas_item_uq UNIQUE (protocol_item_id),
  CONSTRAINT estoque_reservas_valores_ck CHECK (
    quantidade_reservada > 0 AND quantidade_consumida >= 0 AND quantidade_liberada >= 0 AND
    quantidade_consumida + quantidade_liberada <= quantidade_reservada),
  CONSTRAINT estoque_reservas_status_ck CHECK (status IN ('ativa','concluida','liberada'))
);
CREATE INDEX IF NOT EXISTS estoque_reservas_empresa_status_idx ON estoque_reservas (empresa_id, status, substance_id);
CREATE INDEX IF NOT EXISTS estoque_reservas_protocolo_idx ON estoque_reservas (protocol_id);

-- 6) Livro de movimentos (append-only; chave de idempotência impede baixa em dobro).
CREATE TABLE IF NOT EXISTS estoque_movimentos (
  id                 serial PRIMARY KEY,
  empresa_id         integer NOT NULL,
  substance_id       integer NOT NULL,
  tipo               text NOT NULL,
  quantidade         integer NOT NULL,
  reserva_id         integer REFERENCES estoque_reservas(id),
  stock_item_id      integer,
  lote               text,
  protocol_id        integer,
  application_id     integer,
  chave_idempotencia text NOT NULL,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estoque_movimentos_chave_uq UNIQUE (chave_idempotencia),
  CONSTRAINT estoque_movimentos_valores_ck CHECK (quantidade > 0 AND tipo IN ('RESERVA','CONSUMO','LIBERACAO'))
);
CREATE INDEX IF NOT EXISTS estoque_movimentos_substancia_idx ON estoque_movimentos (empresa_id, substance_id, criado_em DESC);
