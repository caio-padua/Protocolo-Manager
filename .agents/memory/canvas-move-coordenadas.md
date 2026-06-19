---
name: Canvas applyCanvasActions move — coordenadas inteiras
description: move em lote falha com x/y fracionario; arredondar para inteiro (Math.round).
---

- Regra: ao usar `applyCanvasActions` com acoes `move` em lote, arredondar `x`/`y` para inteiro
  (`Math.round`).
- **Why:** um lote grande de `move` falhou com `INVALID_REQUEST ... procedure init failed validation`
  porque algumas formas tinham coordenadas fracionarias (imagens importadas com x/y quebrados, ex.:
  1863.7266). Um `move` isolado com inteiro passou; o mesmo lote com `Math.round` passou (114 formas).
- **How to apply:** gerar acoes `{type:"move", shapeId, x:Math.round(...), y:Math.round(...)}` (chaves em
  camelCase). Se um lote enorme ainda falhar, dividir por cluster e aplicar um por vez para isolar o erro.
