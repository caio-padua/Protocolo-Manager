---
name: PADCOM typecheck vs codegen defasado
description: Por que `pnpm --filter @workspace/padcom run typecheck` falha no repo inteiro mesmo com a app rodando.
---

O typecheck do artifact `padcom` falha com vários `TS2305: Module '@workspace/api-client-react' has no exported member 'useListProtocols'/'useListSubstances'/...` em pages/protocols, ras, stock, substances.

**Causa:** os hooks gerados (Orval, a partir do OpenAPI em `@workspace/api-spec`) estão defasados em relação ao que as páginas importam — não é erro do código de página.

**Why:** o dev server (Vite/esbuild) só transpila, não checa tipos, então a app continua rodando normalmente no preview apesar do typecheck quebrado. Isso engana: "app funciona" não implica "typecheck passa".

**How to apply:** ao adicionar páginas novas, valide apenas os SEUS arquivos com `pnpm --filter @workspace/padcom run typecheck 2>&1 | grep <suapagina>`. Para realmente zerar os erros pré-existentes, rode `pnpm --filter @workspace/api-spec run codegen` (regenera hooks + Zod) — mas isso é tarefa à parte, fora do escopo de uma página nova.
