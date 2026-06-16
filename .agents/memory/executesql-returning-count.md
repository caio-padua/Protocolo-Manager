---
name: executeSql RETURNING nao serve para contagem
description: No code_execution, contar linhas afetadas via SELECT COUNT, nao parseando RETURNING
---

# Contagem de linhas com executeSql (code_execution)

Nao conte linhas afetadas por um UPDATE parseando a saida de `RETURNING id`
(ex.: `output.split("\n").slice(1)`). A formatacao da saida do notebook adiciona
uma linha extra por consulta, o que **superestima** a contagem (deu 73 quando o
real era 45) e gera falso alarme de "gravacao nao persistiu".

**Como aplicar:** depois de um lote de UPDATE/INSERT, confirme com um
`SELECT COUNT(*) FILTER (WHERE ...)` separado, ou agrupe por chave
(`GROUP BY name`) comparando `linhas` vs `preenchidas`. O banco e a fonte da
verdade, nao o eco do RETURNING.
