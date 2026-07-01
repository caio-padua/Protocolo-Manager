---
name: Canvas create — shapeId e text shape
description: applyCanvasActions "create" — onde vai o shapeId e por que text shape reprova
---

Ao criar shapes no Canvas com `applyCanvasActions({ actions:[{ type:"create", ... }] })`:

- O `shapeId` vai no NÍVEL DA AÇÃO, nunca dentro de `shape` (`{ type:"create", shapeId:"x", shape:{ type:"iframe", ... } }`). Passar `id` dentro de `shape` dá `procedure init failed validation`.
- `type:"text"` reprovou a validação mesmo minimalista (`{type:"text",x,y,text}`) nesta versão. Alternativa que passa: usar `type:"geo"` (retângulo) com o texto embutido via campo `text` — `geo` aceita `x,y,w,h,color,fill,text`. Para "faixa de título" sem caixa visível, use `fill:"none"`.
- `iframe` create funciona com `{ type:"iframe", x,y,w,h, state:"live", url, componentName, componentPath }`.

**Why:** perdi 3 tentativas com `procedure init failed validation` por (1) `id` dentro de `shape` e (2) shape `text`. O erro é genérico e não diz o campo culpado — isolar UM shape por vez foi o que revelou a causa.

**How to apply:** ao rotular/numerar entregas no Canvas (Art.52), montar selo/título/legenda como `geo` com `text`, não como `text`. Testar um único shape isolado quando o batch reprovar.
