---
name: perguntaId (pergunta_id) nao e chave de identidade
description: Em anamnese_questionario, pergunta_id REPETE (ex.: Q030). Identidade/self-exclusion/dedup de linha deve usar o id numerico, nunca perguntaId.
---

# perguntaId nao identifica uma linha

A coluna `pergunta_id` (campo `perguntaId`) da tabela `anamnese_questionario` NAO e unica:
ha perguntas com o mesmo `pergunta_id` (caso conhecido: Q030 duplica). A origem disso esta
registrada no `replit.md` (excecao 6-A: a colecao deduplica por `id_ihe`, nao por pergunta_id).

**Regra:** qualquer logica de identidade de UMA linha — self-exclusion num loop, dedup,
comparacao "sou eu mesmo?" — deve usar o `id` numerico (chave primaria), nunca `perguntaId`.

**Why:** No guard de DELETE de pergunta (caso extremo da spec: nao apagar pergunta usada por
dependencia), pular o proprio registro por `perguntaId` fazia o loop ignorar dependentes reais
quando havia pergunta_id duplicado — abrindo brecha para apagar pergunta em uso e corromper o
skip-logic. O architect pegou isso. Trocar para `if (p.id === id) continue;` fechou a brecha.

**How to apply:** Ao varrer todas as perguntas para checar referencias (`depende_de` jsonb),
inclua `id` no select e exclua o alvo por `id`. A deteccao de referencia pode bater tanto por
`id` numerico quanto por `perguntaId` textual dentro do jsonb (forma livre), mas a IDENTIDADE
do alvo e sempre o `id`.
