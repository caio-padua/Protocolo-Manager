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
Nao ha export de clinicas/locais no IHE — cadastro de clinicas (SP/Brasilia) mora no Manager.
