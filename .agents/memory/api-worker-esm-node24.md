---
name: Bundle ESM no Node 24
description: Limite de validação do build ao combinar ESM e dependências CommonJS no Node 24.
---

Um build ESM verde não prova que o artefato inicia no Node 24 quando a árvore contém dependências CommonJS.

**Why:** incompatibilidades de carregamento dinâmico podem aparecer apenas no boot do artefato gerado, depois que compilação e typecheck já passaram.

**How to apply:** para serviços ESM empacotados, inclua um smoke test que execute o artefato de produção e confirme que os módulos críticos carregam; não encerre a validação no build.