---
name: Post-merge — migração de banco falha em silêncio e deixa feature quebrada
description: Por que o post-merge não pode usar require('pg') na raiz do monorepo, e por que basta corrigir o script não basta.
---

# 1. `require('pg')` na raiz do monorepo sempre falha

O pnpm isola `node_modules` por pacote. `pg` é dependência de `lib/db`, não da raiz.
Um `node -e "require('pg')"` executado da raiz morre com `MODULE_NOT_FOUND`.

Saída correta: **`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migrations.sql`**.
O `psql` do Nix está no PATH e não depende de `node_modules` nenhum.

# 2. Migração vai em arquivo `.sql` próprio, não embutida no script bash

`scripts/migrations.sql` é o lugar. Todo comando idempotente (`IF NOT EXISTS`),
porque o arquivo inteiro roda de novo a cada merge.

**Why:** task agents diferentes acrescentam migrações ao longo do tempo. Embutidas
como heredoc dentro do bash elas viram um emaranhado e cada agente inventa um jeito.
Um arquivo `.sql` com regras escritas no cabeçalho dá um só padrão para todos.

# 3. A armadilha de verdade: corrigir o script NÃO conserta o banco

Quando o post-merge falha numa migração, o código do task agent **já foi mesclado** e
está rodando contra um banco que não tem a coluna. A feature está quebrada AGORA,
em silêncio, e nenhum alarme aponta para isso.

**How to apply:** ao consertar um post-merge que falhou em migração, sempre fazer os
dois passos: (a) corrigir o script, (b) **conferir no banco que o objeto existe**
(`information_schema.columns`). Nunca dar por resolvido só porque o script passou a
retornar verde — o verde pode ser de uma execução que não tinha mais nada a fazer.
