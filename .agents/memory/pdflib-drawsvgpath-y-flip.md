---
name: pdf-lib drawSvgPath y invertido
description: drawSvgPath usa coordenadas SVG (y para baixo) relativas à opção y — com y:0 tudo cai fora da página, silenciosamente.
---

**Regra:** `page.drawSvgPath(path, { x, y })` interpreta o path em espaço SVG: y cresce para BAIXO a partir da opção `y`. Passar `y: 0` com coordenadas de página (y-up) desenha tudo abaixo da folha — invisível, sem erro/exception.

**Why:** o radar individual da Carta Premium ficou sem polígono preenchido e sem anéis; o try/catch em volta nunca disparou porque desenhar fora da página não lança.

**How to apply:** ancorar `y: page.getHeight()` e converter cada ponto do path com `svgY = pageH - pageY`. Verificar visualmente (pdftoppm + pixel-check) — ausência de erro NÃO prova que o path apareceu.
