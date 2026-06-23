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

**DECISAO FINAL (CEO, doc "VETORIZACAO DA LOGO PAXTER" + opcao A em 23/06/2026):**
- SIMBOLO Rx: NAO redesenhar/tracar. Usar a IMAGEM ORIGINAL do PNG-mestre, intacta
  (so remover o fundo). O CEO reclamou explicitamente quando o simbolo foi vetorizado
  sem ele pedir — a ordem dele era so sobre a PALAVRA. Nao tocar no simbolo sem ordem.
- PALAVRA PAXTER: TRACING AUTOMATICO DO PNG FOI REJEITADO pelo CEO em 23/06/2026
  (ficava serrilhado/rustico, "metal derretido", nao-premium) mesmo upscale 4x+suavizado.
  Decisao final: wordmark vetorial LIMPO, DESENHADO A MAO em SVG (formas geometricas
  controladas, base autoral fornecida pelo proprio CEO). Cada letra = <g id=paxter-letter-p..r>
  com <path> limpo, P e R vazados (fillRule evenodd), NUNCA fonte/<text>. Relevo 3 camadas
  depth/mid-depth/front + brilho fino. Ajuste de proporcao/serifa/chanfro e passo posterior.
- NAO usar potrace/tracing para a marca; se precisar de letra nova, desenhar path a mao.
- Fonte (Cinzel/Cormorant) so e aceita nas FRASES auxiliares.

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
