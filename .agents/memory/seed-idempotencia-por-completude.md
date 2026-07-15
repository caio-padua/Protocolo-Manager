---
name: Seed idempotente por COMPLETUDE (não por existência)
description: Seed que grava conjuntos multi-linha deve medir completude, não presença de 1 linha; e falhar visível quando a chave-alvo não existe.
---

# Seed idempotente por completude (conjuntos multi-linha)

Regra: quando um seed grava um CONJUNTO fixo de N linhas por chave (ex.: 5 faixas
por (analyte_code, sex)), a guarda de idempotência deve exigir as N linhas — não
"existe ≥1 linha". Conjunto parcial (1..N-1) deve ser APAGADO e reinserido
(auto-reparo), senão fica curado pela metade em silêncio e o leitor cai em
fallback sem erro.

**Why:** um seed que pula o par ao ver 1 linha nunca repara um conjunto
truncado por interrupção/edição manual incompleta; o dado parece pronto e o
motor classifica errado sem alarme (achado do architect na onda faixa-por-sexo).

**How to apply:** contar linhas por chave num Map antes do loop; `=== N` pula,
`0` insere, `1..N-1` deleta-só-daquela-chave + reinsere.

## Falha muda em update por chave inexistente
Se o seed liga um flag com `update().where(eq(code))` e o `code` tem typo/desalinho
com o catálogo, o update afeta 0 linhas SEM erro — as linhas-filhas gravam mas
nunca são usadas. Pré-carregar o conjunto de codes válidos, coletar os ausentes e
`logger.error` (nunca update silencioso).

## Unidade canônica: preencher só quando vazia
Curadoria pode preencher `canonical_unit` quando está NULL/'' (não-destrutivo,
resolve risco clínico de comparar valor contra cortes sem unidade), mas NUNCA
sobrescrever unidade já definida (o médico é dono via PUT). Guardar com
`isNull(...)` no WHERE além do guard em memória.
