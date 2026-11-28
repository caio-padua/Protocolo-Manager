---
name: Protocolo: deriva de esquema em protocol_items
description: Coluna empresa_id fora do schema Drizzle e prompts de possível renomeação ao adicionar colunas.
---

Ao aplicar alterações em `protocol_items`, verificar a tabela de desenvolvimento
antes de aceitar sugestões de renomeação do Drizzle. A coluna `empresa_id` pode
existir fora do schema TypeScript e conter dados; uma nova coluna pode ser
indevidamente apresentada como possível renomeação dessa coluna. Preservar
`empresa_id` e aplicar somente a adição explicitamente desejada.

**Why:** Uma tentativa de `drizzle-kit push` sugeriu trocar `empresa_id` por
`catalog_snapshot`; a coluna antiga tinha valores em linhas existentes. Aceitar
essa sugestão poderia perder dados.

**How to apply:** Antes de confirmar um push em `protocol_items`, inspecionar
colunas e dados existentes. Não usar `push-force` para contornar o aviso; optar
por uma alteração aditiva validada e confirmar que a coluna antiga permanece.
