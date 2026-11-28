BEGIN;
CREATE TABLE fornecedores_cadastrados (
  id serial PRIMARY KEY,
  empresa_id integer NOT NULL REFERENCES empresas(id),
  nome text NOT NULL,
  razao_social text, cnpj text, endereco text, telefone text, email text,
  site text, instagram text, fabricante boolean, fornecedor boolean, fonte text,
  ativo boolean NOT NULL DEFAULT true, versao integer NOT NULL DEFAULT 1,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fornecedores_empresa_nome_uq
  ON fornecedores_cadastrados (empresa_id, lower(btrim(nome)));
CREATE UNIQUE INDEX fornecedores_empresa_id_uq ON fornecedores_cadastrados (empresa_id,id);
CREATE TABLE fornecedor_historico (
  id serial PRIMARY KEY,
  empresa_id integer NOT NULL REFERENCES empresas(id),
  fornecedor_id integer NOT NULL,
  profissional_id integer REFERENCES professionals(id),
  ator_tipo text NOT NULL DEFAULT 'profissional',
  justificativa text,
  antes jsonb, depois jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fornecedor_historico_empresa_fornecedor_fk
    FOREIGN KEY (empresa_id, fornecedor_id) REFERENCES fornecedores_cadastrados(empresa_id,id),
  CONSTRAINT fornecedor_historico_autor_ck CHECK (
    (ator_tipo = 'profissional' AND profissional_id IS NOT NULL)
    OR (ator_tipo = 'agente' AND profissional_id IS NULL AND justificativa IS NOT NULL AND length(btrim(justificativa)) > 0)
  )
);
COMMIT;
