---
name: Wordmark SVG desenhado a mao — vao de kerning entre glifos
description: Por que letras vetoriais autorais aparecem com buraco entre si e como evitar
---

Ao desenhar um wordmark como glifos SVG autorais (path d, sem fonte), cada letra tem um
"avanco" (posicao x da proxima letra). Se o avanco/posicao x de um glifo for maior que a
largura REAL do desenho daquele glifo, abre um buraco — ex.: "P AXTER" lendo como duas
palavras em vez de "PAXTER".

**Why:** o subagente de design NAO consegue pre-visualizar nem tirar screenshot; ele
"desenha no escuro". Defeitos de kerning/avanco (buraco entre letras, corte no viewBox,
sobreposicao) sao comuns e passam batido para ele.

**How to apply:** depois que um subagente entrega letras vetoriais, o agente principal
SEMPRE reinicia o preview e confere com screenshot proprio; manda follow-up pedindo
avanco/posicao x uniforme e viewBox que enquadre a palavra inteira. Nao confiar no
"feito" do subagente para forma de letra — so o olho (screenshot) prova.
