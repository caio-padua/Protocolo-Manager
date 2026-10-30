---
name: Integração sem conflito textual pode quebrar comportamento
description: Preservação de funcionalidades concorrentes e validação após integrar alterações.
---

Uma integração sem conflitos textuais não comprova correção semântica.

**Why:** alterações concorrentes podem combinar trechos de rotas diferentes, trocar funções chamadas ou restaurar cópias antigas sem deixar marcas de conflito.

**How to apply:** comparar a intenção dos dois lados antes de resolver; nunca escolher uma versão inteira sem verificar as funcionalidades que seriam perdidas. Conferir o resultado com compilação, testes direcionados e execução. Não assumir que a base principal está correta sem inspecioná-la.

Régua decorativa com sinais de igualdade pode ser confundida com um conflito pela verificação automatizada.

**Why:** a busca pode reconhecer a sequência fora do início da linha.

**How to apply:** utilizar hífens em comentários decorativos e descrever marcadores por extenso em documentação.
