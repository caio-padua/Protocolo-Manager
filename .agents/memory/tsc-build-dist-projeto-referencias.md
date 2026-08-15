---
name: mudou lib/db/src/schema mas o typecheck de outro pacote não vê a coluna nova
description: Por que `tsc --build` com project references mostra "no exported member" para uma coluna/tabela recém-adicionada mesmo com o .ts fonte correto, e como resolver.
---

# Project references usam o `dist/` compilado, não o `.ts` fonte — rebuild manual necessário

Depois de editar `lib/db/src/schema/dieta.ts` (nova tabela ou nova coluna) e
rodar o typecheck de `artifacts/api-server` (que depende de `@workspace/db`
via TypeScript project references), o erro `"no exported member"` aparece
para algo que claramente existe no arquivo fonte. A causa: project
references resolvem contra `lib/db/dist/**/*.d.ts` (os `.d.ts` já compilados),
não contra o `.ts` fonte — e esse `dist/` só é regenerado quando alguém builda
a lib explicitamente.

**Why:** `tsc --build` confia em timestamps/artefatos incrementais por
pacote; editar o `.ts` fonte de uma lib não dispara rebuild automático das
libs das quais outros pacotes dependem — cada pacote do monorepo é
"independente" nesse sentido (inclusive: um erro pré-existente de TS2308 em
`lib/api-zod` não bloqueia o build de `lib/db`, porque são projetos-folha
separados).

**How to apply:** depois de QUALQUER mudança em `lib/db/src/schema/*.ts` (ou
outra lib compartilhada), rodar `pnpm run typecheck:libs` (rebuilda o
`dist/` das libs) ANTES de rodar o typecheck do pacote consumidor
(api-server, padcom etc.) — senão os erros fantasmas de "no exported member"
mascaram o estado real do código. Ver também `padcom-typecheck.md` (o
typecheck global do padcom já é pré-quebrado por outro motivo — tipos gerados
desatualizados — então filtrar sempre pelos arquivos tocados, não pelo total
de erros).

**Correção testada (15/08/2026):** na prática o `pnpm run typecheck:libs`
(raiz, `tsc --build`) para com exit code 2 nos erros pré-existentes de
`lib/api-zod` e NÃO chega a regenerar o `dist/` de `lib/db` nessa mesma
chamada — não confiar que "rodei o typecheck:libs" implica dist atualizado
quando a raiz falha. Confirmar sempre com `grep` no `.d.ts` gerado; se ainda
faltar o campo novo, rodar o build isolado direto no pacote: `cd lib/db &&
npx tsc --build --force tsconfig.json` (bypassa o projeto quebrado da raiz e
regenera só o que interessa).
