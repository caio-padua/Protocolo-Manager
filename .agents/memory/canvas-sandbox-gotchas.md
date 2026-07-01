---
name: Canvas state buckets + code_execution env
description: Como o getCanvasState devolve formas (baldes capados) e por que ausência não é inexistência; process.env no sandbox.
---

## getCanvasState não devolve um `shapes[]` plano
Retorna baldes: `focusedShapes`, `blurryShapes`, `peripheralClusters` (+ `summary`, `viewport`).
Cada balde é CAPADO (ex.: ~200 focused / ~500 blurry). Em Canvas grande, uma forma existente pode
não aparecer em nenhum balde retornado.

**Regra:** ausência no getCanvasState NÃO prova que a forma sumiu. A prova autoritativa de existência
é `applyCanvasActions({type:"update", shapeId})` devolver `applied:true` (update em id inexistente não
aplica). Para achar uma forma específica num board cheio, prefira `focusArea`/`presentArtifact` por id
a filtrar o dump inteiro.

**Why:** perdi tempo procurando `e41-*` no dump e concluindo que não existiam, quando o update já
provara que existiam — só estavam fora da janela retornada.

## Update de forma exige `updates` + `shapeType`
Create usa a chave `shape`; update usa `updates` e AINDA exige `shapeType` dentro de `updates`
(ex.: `"iframe"`, `"text"`) senão dá erro de serialização. São contratos diferentes.

## code_execution NÃO tem `process.env`
No sandbox de code_execution, `process.env` é `undefined` (quebra ao ler `process.env.REPLIT_DOMAINS`).
Passe o domínio como string literal, ou obtenha-o via `bash`/tool e cole. `bash` sim tem `$REPLIT_DOMAINS`.
