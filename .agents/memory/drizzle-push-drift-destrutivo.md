---
name: drizzle-kit push pode propor DROP de colunas reais por causa de drift preexistente
description: Por que rodar `drizzle-kit push` neste repo é arriscado mesmo para uma mudança aditiva pequena, e o que fazer em vez disso.
---

# `drizzle-kit push` comparou contra drift antigo e quis dropar objetos existentes

Ao adicionar estrutura nova, `drizzle-kit push` pode gerar operações fora do
escopo por divergência entre o esquema Drizzle e o banco real. Um filtro estreito
de tabelas aplicado ao banco, mantendo o arquivo de esquema completo, também pode
fazer a ferramenta tratar tabelas declaradas como ausentes. Um esquema temporário
que exporta só tabelas novas pode, por sua vez, propor remover sequências das
tabelas omitidas.

**Why:** `drizzle-kit push` é um diff schema-vs-banco de mão única — ele não
sabe distinguir "coluna que devia existir mas o esquema esqueceu de declarar"
de "coluna órfã para remover". O filtro `tablesFilter` limita a introspecção do
banco, não necessariamente a serialização do esquema atual. Além disso, uma chave
estrangeira composta só pode ser criada depois de existir uma restrição única
compatível nas colunas referenciadas; um índice único gerado depois da chave
estrangeira não resolve a ordem da migração.

**How to apply:**
1. Nunca use `push-force` nem aceite truncamento para contornar uma divergência;
   leia o plano completo antes de qualquer aplicação.
2. Em banco gerenciado pelo Replit, use o fluxo de desenvolvimento e publicação
   documentado pelo Replit. Em banco PostgreSQL externo, siga o procedimento
   específico do projeto para túnel e aplicação.
3. Não use um `tablesFilter` estreito com um índice que exporta o esquema inteiro
   sem confirmar o plano de criação e remoção; o filtro pode alcançar apenas a
   introspecção do banco. Confirme também que nenhuma sequência ou objeto fora do
   escopo aparece no plano.
4. Para chaves estrangeiras compostas, declare a chave referenciada como
   `unique()` na definição da tabela, não como `uniqueIndex()` separado, e mantenha
   os nomes alinhados com a migração.
5. Reforça a "Regra de Ouro" (`regra-de-ouro-preservar.md`): nunca aceitar um
   diff destrutivo de esquema sem ordem escrita explícita do CEO.
