---
name: Bundle ESM no Node 24
description: Limite de validação do build ao combinar ESM e dependências CommonJS no Node 24.
---

Um build ESM verde não prova que o artefato inicia no Node 24 quando a árvore contém dependências CommonJS.

**Why:** incompatibilidades de carregamento dinâmico podem aparecer apenas no boot do artefato gerado, depois que compilação e typecheck já passaram.

**How to apply:** para serviços ESM empacotados, inclua um smoke test que execute o artefato gerado e confirme que os módulos críticos carregam; não encerre a validação no build. Se dependências CommonJS exigirem `require` dinâmico, o bundle precisa de `createRequire(import.meta.url)` em runtime.

**Why:** quando um worker empacota código de logger compartilhado de outro pacote, o destino de transporte `pino-pretty` é resolvido no contexto do pacote consumidor, não no pacote de origem.

**How to apply:** declare o transporte de desenvolvimento como dependência direta do worker que o executa e valide cofre, banco e primeiro ciclo no processo real do artefato.