BEGIN;
CREATE TABLE substance_variantes (
  id serial PRIMARY KEY,
  empresa_id integer NOT NULL REFERENCES empresas(id),
  substance_id integer NOT NULL REFERENCES substances(id),
  dose_total text NOT NULL,
  forma text NOT NULL,
  volume_ml numeric,
  concentracao text,
  composicao text,
  subtipo_implante text,
  vias_fonte text NOT NULL,
  versao integer NOT NULL DEFAULT 1,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT substance_variantes_campos_ck CHECK (
    length(btrim(dose_total)) > 0 AND length(btrim(forma)) > 0 AND length(btrim(vias_fonte)) > 0
    AND (volume_ml IS NULL OR volume_ml > 0)
  ),
  CONSTRAINT substance_variantes_implante_ck CHECK (
    subtipo_implante IS NULL OR (forma='implante' AND subtipo_implante IN ('absorvivel','nao_absorvivel'))
  )
);
CREATE UNIQUE INDEX substance_variantes_empresa_id_uq ON substance_variantes(empresa_id,id);
CREATE TABLE substance_ofertas (
  id serial PRIMARY KEY,
  empresa_id integer NOT NULL REFERENCES empresas(id),
  variante_id integer NOT NULL,
  fornecedor_id integer NOT NULL,
  posicao integer NOT NULL,
  origem_chave text NOT NULL,
  documento text NOT NULL,
  pagina integer NOT NULL,
  linha integer NOT NULL,
  embalagem_original text NOT NULL,
  fonte_texto text NOT NULL,
  fonte_data_nome_arquivo text,
  quantidade_embalagem integer NOT NULL,
  custo_unitario_centavos integer NOT NULL,
  custo_embalagem_centavos integer NOT NULL,
  moeda text NOT NULL DEFAULT 'BRL',
  versao integer NOT NULL DEFAULT 1,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT substance_ofertas_variante_empresa_fk
    FOREIGN KEY (empresa_id,variante_id) REFERENCES substance_variantes(empresa_id,id),
  CONSTRAINT substance_ofertas_fornecedor_empresa_fk
    FOREIGN KEY (empresa_id,fornecedor_id) REFERENCES fornecedores_cadastrados(empresa_id,id),
  CONSTRAINT substance_ofertas_valores_ck CHECK (
    posicao BETWEEN 1 AND 5 AND pagina > 0 AND linha > 0 AND quantidade_embalagem > 0 AND custo_unitario_centavos >= 0
    AND custo_embalagem_centavos >= 0
    AND length(btrim(origem_chave)) > 0 AND length(btrim(fonte_texto)) > 0
    AND length(btrim(documento)) > 0 AND length(btrim(embalagem_original)) > 0
  )
);
CREATE UNIQUE INDEX substance_ofertas_origem_uq ON substance_ofertas(empresa_id,origem_chave);
CREATE UNIQUE INDEX substance_ofertas_empresa_id_uq ON substance_ofertas(empresa_id,id);
CREATE UNIQUE INDEX substance_ofertas_posicao_uq ON substance_ofertas(variante_id,posicao);
CREATE TABLE substance_variante_historico (
  id serial PRIMARY KEY,
  empresa_id integer NOT NULL REFERENCES empresas(id),
  variante_id integer NOT NULL,
  profissional_id integer REFERENCES professionals(id),
  ator_tipo text NOT NULL,
  justificativa text,
  antes jsonb,
  depois jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT substance_variante_historico_empresa_fk
    FOREIGN KEY (empresa_id,variante_id) REFERENCES substance_variantes(empresa_id,id),
  CONSTRAINT substance_variante_historico_autor_ck CHECK (
    (ator_tipo='profissional' AND profissional_id IS NOT NULL)
    OR (ator_tipo='agente' AND profissional_id IS NULL AND justificativa IS NOT NULL AND length(btrim(justificativa))>0)
  )
);
CREATE TABLE substance_oferta_historico (
  id serial PRIMARY KEY,
  empresa_id integer NOT NULL REFERENCES empresas(id),
  oferta_id integer NOT NULL,
  profissional_id integer REFERENCES professionals(id),
  ator_tipo text NOT NULL,
  justificativa text,
  antes jsonb,
  depois jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT substance_oferta_historico_empresa_fk
    FOREIGN KEY (empresa_id,oferta_id) REFERENCES substance_ofertas(empresa_id,id),
  CONSTRAINT substance_oferta_historico_autor_ck CHECK (
    (ator_tipo='profissional' AND profissional_id IS NOT NULL)
    OR (ator_tipo='agente' AND profissional_id IS NULL AND justificativa IS NOT NULL AND length(btrim(justificativa))>0)
  )
);
COMMIT;
