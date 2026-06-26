---
name: api-zod barrel reexport TS2308
description: Por que o index.ts de lib/api-zod não pode reexportar generated/types junto com generated/api.
---

# api-zod: barrel não pode reexportar types homônimos aos consts zod

O barrel `lib/api-zod/src/index.ts` deve exportar SÓ `export * from "./generated/api"`.
NÃO reexportar também `./generated/types`.

**O erro:** reexportar os dois com `export *` (mesmo `export type *`) gera `TS2308`
("Module ... has already exported a member named X"). O codegen produz, para o mesmo
nome (ex.: um schema), um `const` zod em `generated/api` e um `type`/`interface` em
`generated/types`. Os dois ocupam o mesmo nome no namespace de exportação do barrel e
colidem. `export type *` NÃO resolve: o `const` de `api` também traz seu tipo implícito,
então ainda há dois "X" exportados.

**Por que remover types é seguro:** todos os consumidores do app usam os `const` zod
(`Schema.parse`, `z.infer<typeof Schema>`), nunca os `type` crus de `generated/types`.
Os tipos são redundantes — derivam-se via `z.infer`. Removê-los do barrel zera a colisão
sem perda real.

**Como aplicar:** se o `pnpm run typecheck:libs` quebrar com TS2308 em api-zod, conferir
o barrel; manter apenas o reexport de `./generated/api`. Não tentar `export type *` como
band-aid. Se algum dia um consumidor precisar do tipo cru, importe direto de
`./generated/types` no ponto de uso, não pelo barrel.
