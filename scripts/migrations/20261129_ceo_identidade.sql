-- Identidade do CEO da PaxMed (entidade empresarial) + interruptor "Profissional Médico".
-- O interruptor liga/desliga o uso do cadastro MÉDICO (profissional) do CEO para emitir documentos.
-- Aditiva: nada é apagado. Começa LIGADO para não mudar o comportamento atual.
CREATE TABLE IF NOT EXISTS ceo_identidade (
  id                       integer PRIMARY KEY CHECK (id = 1),
  foto_path                text,
  medico_ativo             boolean NOT NULL DEFAULT true,
  medico_professional_id   integer,
  atualizado_por           integer,
  atualizado_em            timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ceo_identidade (id, medico_professional_id)
SELECT 1, (SELECT id FROM professionals WHERE is_primary_doctor AND active ORDER BY id LIMIT 1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS ceo_identidade_auditoria (
  id            serial PRIMARY KEY,
  campo         text NOT NULL,
  valor_antes   text,
  valor_depois  text,
  por           integer,
  em            timestamptz NOT NULL DEFAULT now()
);

-- Administrador e Responsável técnico por clínica (escolhidos em lista; não cria login nem senha).
CREATE TABLE IF NOT EXISTS empresa_responsaveis (
  empresa_id                    integer PRIMARY KEY REFERENCES empresas(id),
  administrador_professional_id integer,
  responsavel_tecnico_professional_id integer,
  atualizado_por                integer,
  atualizado_em                 timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS empresa_responsaveis_auditoria (
  id            serial PRIMARY KEY,
  empresa_id    integer NOT NULL,
  funcao        text NOT NULL,
  antes         integer,
  depois        integer,
  por           integer,
  em            timestamptz NOT NULL DEFAULT now()
);
