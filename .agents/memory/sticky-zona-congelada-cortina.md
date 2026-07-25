---
name: Zona congelada em flex-row: cortina sticky de altura total
description: Como matar bleed-through em planilha com colunas fixadas (position sticky) dentro de linhas flex.
---

Regra: numa planilha de linhas flex (`items-center`) com colunas fixadas por `position: sticky`, cada célula fixada sozinha NÃO basta — ela é mais baixa que a linha (o painel do nome dita a altura), então a esteira que rola aparece nas faixas acima/abaixo dela, nos vãos do gap e nas sombras entre linhas.

**Solução em 2 camadas:**
1. Cada célula fixada vira uma CORTINA `self-stretch` (altura total da linha), fundo opaco, `willChange: transform`, `zIndex` alto; a caixinha visual fica centralizada dentro.
2. Uma CORTINA-BASE por linha cobre a zona congelada inteira (nome + N colunas + vãos): filha sticky `left: 0` de largura ZERO (`marginRight: -GAP` anula o gap do flex) com div interna `width = NAME_W + GAP + N*(COL_W+GAP)` e `height: calc(100% + 8px)` (cobre o respiro entre linhas). z intermediário: acima da esteira (auto), abaixo do nome (30) e das células fixadas (20).

**Why:** máscara por box-shadow (`8px 0 0 0 bg`) só cobre o vão lateral; não cobre altura nem sombras/neon das células roladas (screen-3d tem sombra de 26px que vaza entre linhas).

**Armadilha:** TODO elemento sticky da zona congelada (inclusive o CABEÇALHO da coluna fixada) precisa de z-index ACIMA da cortina-base — cabeçalho com z baixo (3) some atrás da cortina (z:10), apagando quadradinho/data/lab. Regra: cortina-base = z mais baixo da zona; tudo que é sticky fica acima dela.

**How to apply:** EvolucaoExamesPanel (Cela + CortinaZona). Para testar por screenshot, pré-fixar coluna + scrollTo via efeito temporário com query param (screenshot não clica nem rola).
