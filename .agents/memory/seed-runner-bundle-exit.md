---
name: Seed com bloco runner mata o servidor no boot
description: Por que um arquivo de seed importado no entry do api-server derruba o processo, e como evitar.
---

Um arquivo de seed que tenha o bloco "runner direto"
(`if (import.meta.url === \`file://${process.argv[1]}\`) { ...; process.exit(0) }`)
NÃO pode ser importado pelo entry do servidor (`artifacts/api-server/src/index.ts`).

**Why:** o esbuild empacota tudo num único `dist/index.mjs`. Dentro do bundle, a
condição do runner é satisfeita no boot, o seed roda e chama `process.exit(0)`,
derrubando o servidor logo após "Server listening" (workflow vira FINISHED, curl dá 502).
`seed-clinics.ts` tem esse bloco e funciona só porque NÃO é importado no entry —
roda apenas via `tsx`.

**How to apply:** se o seed deve rodar no boot (idempotente por chave de negócio,
ex.: `contentKey`), importe a função e chame-a no callback de `app.listen`, e NÃO
deixe nenhum bloco runner/`process.exit` no arquivo. Se precisar de runner manual,
crie um script separado em `scripts/` que importe a função do seed.
