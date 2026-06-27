---
name: Regra de ouro da transmutacao IHE->Manager (zero perda de campo)
description: Diretriz do CEO — ao puxar dados do IHE, nunca perder campo; se o export tem campo que nao existe no nosso banco, ACRESCENTAR coluna (ADD COLUMN). Nao reconstruir, so acrescentar.
---

# Regra de ouro: zero perda de campo na transmutacao

Diretriz do CEO Dr. Caio (27/06/2026): ao puxar dados do IHE, se o arquivo de export trouxer
um campo que NAO existe no nosso cadastro, o agente ACRESCENTA a coluna ao nosso banco
(ALTER TABLE ADD COLUMN). "Nao construir, apenas acrescentar" — nunca recriar/derrubar tabela,
nunca ignorar campo.

**Como a ponte funciona:** por ARQUIVO (nao conexao viva ao banco do IHE). O IHE publica JSON
em raw.githubusercontent (repo Integrative-Health-Engine, pasta docs/dr-replit/PARA_MANAGER);
o Manager importa via `POST /api/transmutacao/import`. Primos independentes (conceito raiz).

**Estado verificado (export catalogo 26.06.13):** 100% coberto. As tabelas catalogo_* ja tem
TODOS os campos de negocio das 6 colecoes (periodos_dia, itens_terapeuticos, formulas,
injetaveis, implantes, blends). Zero campo a acrescentar nesse export. ("ativos" do blend nao e
campo faltante — vira linhas em catalogo_blend_ativos.)

**Risco a vigiar (por que a regra importa):** o importador atual faz cherry-pick (monta o
registro campo a campo). Campo NOVO que o IHE adicionar num export futuro e IGNORADO em silencio
-> violaria a regra de ouro. Excecao boa ja existente: catalogo_exames guarda a linha crua
inteira num jsonb `dados` (0 perda real). Esse e o padrao a generalizar.

**How to apply:** antes de importar QUALQUER export do IHE: (1) diagnosticar campos do JSON x
colunas da tabela; (2) criar colunas para os faltantes (ADD COLUMN, tipo compativel, nullable);
(3) idealmente guardar a linha crua num jsonb `dados` como rede de seguranca. NUNCA DROP/recriar.

**Achado real (verificado no banco em 27/06/2026):** as clinicas/unidades do IHE (que la sao
empresas multi-tenant) JA estao no Manager como tabela `locations`, com o ID PRESERVADO — os
`unidade_id` dos pacientes [15,8,9,10,14,19,16,18,1] casam 1:1 com `locations.id`. Conceito do
CEO: multi-tenant no IHE -> aqui viram clinicas onde o proprio Dr. Caio atende. NAO existe
arquivo .json de clinicas, mas o cadastro existe (locations). O QUE FALTA (caso classico da
regra de ouro): o campo `unidade_id` do export de pacientes NAO tem coluna em `clients` (so
existe `ficha_clinica`, que e dado de saude, outra coisa) -> o vinculo paciente->clinica se
PERDEU na importacao. Para corrigir: ADD COLUMN location_id em clients e religar por CPF (clients
guarda cpf como chave natural; pacientes nao guardam id_ihe). Catalogo/itens/formulas: contagem
no banco bate 1:1 com o export (457/54/305/32/12/9) — importacao completa.

**Correcao do CEO (27/06/2026):** o `unidade_id` variado do export (3882 em "Joao Pessoa",
~300 em varios consultorios, so 3 em Instituto Padua) e ERRO de cadastro do IHE. Na realidade
TODOS os pacientes sao do Instituto Padua (location id 8). Portanto, ao religar NAO usar o
unidade_id do export como verdade: default = Instituto Padua; o numero original pode ser
guardado so como auditoria (rede de seguranca), nunca como vinculo operacional. A ferramenta
pedida e o "minimo motor de cadastro vinculado a clinica" (MVP): no cadastro do cliente tem
passo de foto + lista suspensa data-bound de clinica de origem (le `locations`, so cresce ao
adicionar, "remover"=inativar), autopreenche Instituto Padua, e cresce depois. CUIDADO: clinica
de ORIGEM (cadastro) != clinica da SESSAO (agenda) que define o endereco do lembrete.
