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

- Criar iframe pronto: NAO mandar `state` na acao `create` (passar `state:"ready"` quebra com
  `INVALID_REQUEST ... procedure init failed validation`). Iframe pronto = `{type:"create", shapeId,
  shape:{type:"iframe", x,y,w,h, url, componentPath, componentName}}` (sem `state`); `state:"building"`
  so no fluxo de placeholder. Domain via env do shell (`$REPLIT_DOMAINS`), NAO no sandbox do code_execution
  (la `process.env` e undefined) — pegar por bash e colar a URL literal.
