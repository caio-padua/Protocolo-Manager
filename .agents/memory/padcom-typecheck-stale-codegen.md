---
name: PADCOM typecheck quebrado no repo inteiro (api-zod export collision)
description: Por que `pnpm run typecheck` / typecheck de qualquer artifact falha no repo inteiro mesmo com a app rodando, e qual a causa raiz real.
---

O typecheck do projeto inteiro falha (vários `TS2305 has no exported member` em `@workspace/db`, `@workspace/api-zod`, `@workspace/api-client-react`, e cascatas em api-server/padcom).

**Causa raiz real (confirmada):** `tsc --build` (typecheck:libs) falha em `lib/api-zod/src/index.ts` com `TS2308`. O arquivo faz `export * from "./generated/api"` (schemas Zod = VALORES, ex.: `export const CreateProtocolBody = zod.object(...)`) E `export * from "./generated/types"` (TIPOS TS com os MESMOS nomes, ex.: `CreateProtocolBody`). Os dois `export *` colidem → ambiguidade. Como o build das libs para aqui, nenhuma lib emite `.d.ts`, e por isso TODAS as importações de tipo a jusante (`protocolsTable`, hooks Orval, schemas) aparecem como "no exported member". Não é codegen defasado — é colisão estrutural de export.

**Why:** o dev server (Vite/esbuild) só transpila, não checa tipos, então a app roda normalmente no preview apesar do typecheck quebrado. "App funciona" NÃO implica "typecheck passa". Verificar features por runtime (curl, screenshot, gerar PDF) é o caminho confiável enquanto o build de tipos estiver quebrado.

**How to apply:** isso é PRÉ-EXISTENTE e fora do escopo de tarefas de feature — não corrigir sem avisar o usuario (oferecer como opção). Possível fix arriscado: trocar a 2a linha para `export type * from "./generated/types"` (separa namespace de tipo do de valor), mas pode derrubar enums `const` exportados pelos arquivos de types — testar antes. Para validar SUAS mudanças sem depender do build: use runtime (curl nas rotas, screenshot das telas, gerar o PDF e extrair texto com `pdftotext`). `python3` NÃO existe no shell — use `node`/`jq` para parsear JSON.
