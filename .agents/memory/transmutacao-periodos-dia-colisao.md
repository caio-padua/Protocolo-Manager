---
name: Tabela nativa da transmutação IHE já pode existir (periodos_dia)
description: Antes de criar um schema Drizzle novo, conferir se a transmutação IHE já trouxe a tabela para catalogo.ts, senão o esbuild quebra com "Ambiguous import".
---

# Tabela nativa da transmutação pode já existir no barrel

A transmutação IHE → Manager traz tabelas para `lib/db/src/schema/catalogo.ts` como
código NATIVO (sem tag de origem). `periodos_dia` (as 9 janelas cronobiológicas) já
mora lá com `periodosDiaTable`.

**Regra:** antes de criar um arquivo de schema novo para algo que veio (ou pode ter vindo)
do IHE, `rg` pelo nome da const/tabela em `schema/` inteiro. Se já existe, REUSE — não
crie um segundo `pgTable("mesmo_nome")`.

**Why:** dois `export const xTable = pgTable("mesmo_nome", ...)` no barrel (`schema/index.ts`)
compilam, mas o esbuild do api-server derruba o boot com
`Ambiguous import "xTable" has multiple matching exports` no primeiro arquivo que importa
o nome (ex.: `transmutacao.ts`). O typecheck global pré-quebrado NÃO pega isso; só aparece
ao reiniciar o workflow da API.

**How to apply:** ao portar um motor do IHE, se o motor não precisa ler a tabela
diretamente (ex.: motor de lembrete usa mapa hardcoded manhã/tarde/noite → IM/IT/NO),
não recrie a tabela só para ter o seed; a versão nativa em catalogo.ts já é a fonte.
