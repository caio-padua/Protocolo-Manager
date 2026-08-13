---
name: drizzle-kit push pode propor DROP de colunas reais por causa de drift preexistente
description: Por que rodar `drizzle-kit push` neste repo é arriscado mesmo para uma mudança aditiva pequena, e o que fazer em vez disso.
---

# `drizzle-kit push` comparou contra drift antigo e quis dropar dezenas de colunas com dados reais

Ao adicionar colunas novas e puramente aditivas a uma tabela existente, rodar
`drizzle-kit push` NÃO fez só o ALTER TABLE esperado — ele comparou o schema
Drizzle inteiro contra o banco inteiro, e como já existe drift preexistente
entre `lib/db/src/schema/*.ts` e o banco real (colunas que foram adicionadas
via SQL manual em tarefas passadas, sem nunca ter sido "reconciliadas" pelo
push), a ferramenta propôs DROP de várias colunas não relacionadas que tinham
dados reais de produção.

**Why:** `drizzle-kit push` é um diff schema-vs-banco de mão única — ele não
sabe distinguir "coluna que devia existir mas o schema esqueceu de declarar"
de "coluna órfã para remover". Num repo com histórico de ALTER TABLE manual
(comum aqui — ver `saas-multitenant-onda-abc.md`, `sql-null-int-filter.md`),
o drift acumulado faz qualquer push, mesmo de uma mudança pequena e aditiva,
arrastar um diff gigante e potencialmente destrutivo.

**How to apply:**
1. Antes de rodar `drizzle-kit push` neste repo, considerar SEMPRE usar SQL
   bruto (`ALTER TABLE ... ADD COLUMN`) para mudanças aditivas, aplicado via
   psql/tunnel direto — nunca o push automático.
2. Se o push for inevitável, rodar em modo dry-run/verificar o plano antes de
   confirmar, e ABORTAR se aparecer qualquer `DROP COLUMN` não esperado
   explicitamente pela mudança em questão.
3. Depois de aplicar via SQL bruto, os tipos TS em `lib/db/src/schema/*.ts`
   devem ser atualizados manualmente para bater com o banco (push nunca reflete
   de volta) — e ver `tsc-build-dist-projeto-referencias.md` para o passo de
   rebuild do `dist/` que os consumidores via project references exigem.
4. Reforça a "Regra de Ouro" (`regra-de-ouro-preservar.md`): nunca aceitar um
   diff destrutivo de schema sem ordem escrita explícita do CEO.
