---
name: Wordmark PAXTER segue a logo aprovada
description: A marca PAXTER em texto deve reproduzir a logo oficial do CEO (serifa cinzelada ouro 3D), nunca inventar letras
---

Regra: qualquer "wordmark"/nome PAXTER renderizado deve REPRODUZIR a logo oficial aprovada
pelo CEO (anexo `LOGO_PAXTER_0_(PRINCIPAL)`): serifa engravada estilo Trajan/Cinzel, face de
ouro polido em bandas de reflexo, com EXTRUSAO para baixo (relevo "saliente"/sobressalente).
As 2 frases ("Clinical Intelligence System" e "PRECISION IN INTEGRATIVE CARE") tambem entram
em ouro 3D no mesmo tratamento.

**Why:** o CEO rejeitou explicitamente 5 modelos de wordmark abstratos (geometrico, stencil,
inline, monolito) por nao terem "nada a ver" com a logo que ele ja definiu. A identidade ja
existe; o trabalho e VETORIZAR/replicar fiel, nao criar letras novas.

**DECISAO FINAL (CEO, doc "VETORIZACAO DA LOGO PAXTER"):** nem fonte nem letra a mao —
a palavra PAXTER e o simbolo Rx devem ser PATHS SVG TRACADOS do PNG de referencia
(carbono/molde da imagem), depois receber ouro + relevo por cima. Fonte (Cinzel) so e
aceita para as FRASES auxiliares.

**How to apply (tracing):** `scripts/trace-paxter.cjs` usa `potrace` (node, ja instalado;
jimp vem junto). Detecta as faixas de ouro por varredura de linhas (luminancia), recorta
simbolo e palavra, traca com `blackOnWhite:false` (ouro=claro sobre fundo escuro), winding
nonzero da certo nos vazados (P/A/R/E). Os dois recortes vem do MESMO PNG => recompor pela
origem original (simbolo translate 354,180; palavra 45,647) reproduz o layout exato.
Saida em `_shared/paxterVectorPaths.ts`; componente `_shared/PaxterLogoVector.tsx`
(variant hero/compact/wordmark/symbol, gradiente/filtros da instrucao do CEO, useId p/
ids unicos). Ouro precisa de fundo escuro p/ brilhar (no tema claro, por num cartao escuro).
Apos aprovar: limpar pontos do traco e graduar p/ artifacts/padcom (PaxterLogo.tsx/.css +
.svg). NAO voltar a usar fonte para o nome.
