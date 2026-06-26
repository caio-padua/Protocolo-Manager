---
name: NULL nao colide em UNIQUE (Postgres) — idempotencia de amarracoes
description: Por que onConflictDoNothing falha quando o indice unico inclui coluna nullable; como garantir idempotencia em rotas de insercao.
---

# NULL nao colide em UNIQUE no PostgreSQL

No PostgreSQL, dois valores `NULL` NAO sao considerados iguais em um indice UNIQUE
(comportamento padrao, sem `NULLS NOT DISTINCT`). Logo, se um indice unico inclui
uma coluna nullable e a linha entra com `NULL` nessa coluna, `onConflictDoNothing()`
do Drizzle NAO detecta conflito e duplicatas passam.

**Onde isso morde aqui:** tabelas `pergunta_sintoma` / `pergunta_doenca` tem indice
unico que inclui `gatilho_valor` (nullable). O seed e a rota de insercao podiam
duplicar amarracoes quando `gatilho_valor` era nulo.

**Como aplicar:** em rotas POST que inserem nessas tabelas, fazer guarda de
existencia manual ANTES do insert — `and(eq(perguntaId), eq(sintomaCodigo),
gatilho === null ? isNull(col) : eq(col, gatilho))` — e retornar 409 se ja existe.
Nao confiar so em `onConflictDoNothing()` quando a chave do indice tem coluna nullable.

**Why:** sem isso a base clinica (DB-driven) acumula amarracoes duplicadas, o que
infla escore/sintomas/doencas do motor silenciosamente. Idempotencia e regra do projeto.

## Idempotencia atomica via indice unico parcial + catch 23505

Quando a regra e "no maximo 1 linha PENDENTE por cliente" (ex.: fila de indicacao do
motor), o select-then-insert tem corrida. A forma atomica: indice unico PARCIAL no
banco — `uniqueIndex(...).on(t.clientId).where(sql\`origem='motor' AND status='pendente'\`)`
— e a rota faz insert-first, capturando o conflito.

**Pegadinha critica (drizzle):** o erro do Postgres vem EMBRULHADO por um
`Error: Failed query: ...`. O codigo SQLSTATE `23505` (unique_violation) NAO esta em
`err.code` — esta em `err.cause.code`. Checar os DOIS: `err.code ?? err.cause?.code`.
Se checar so `err.code`, o catch nao dispara e a rota responde 500 em vez de 200.

**How to apply:** insert-first dentro de try; no catch, `const pgCode = err.code ?? err.cause?.code;`
se `=== "23505"` faz SELECT da linha existente e devolve 200 `{criada:false}`; senao `throw err`.
