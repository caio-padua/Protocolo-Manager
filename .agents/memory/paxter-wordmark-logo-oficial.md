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

**ATUALIZACAO FINAL (CEO, 23/06/2026 noite — SUPERSEDE o SVG geometrico):** o wordmark
geometrico desenhado a mao tambem foi REJEITADO (limpo porem perdeu serifa/chanfro). Solucao
aceita e EM PRODUCAO: LOCKUP VIVO usando os PIXELS REAIS do anexo, sem redesenho nem tracing.
- Cada parte de texto (PAXTER+Clinical num bloco / PAXTER sozinho / PRECISION / AI-guided)
  e RECORTADA do PNG-mestre e tornada TRANSPARENTE por luminancia->alfa
  (`convert crop.png \( +clone -colorspace Gray -level 10%,100% \) -alpha off -compose CopyOpacity -composite out.png`).
  Isso PRESERVA o ouro 3D original (chanfro/relevo) sobre qualquer fundo escuro.
- BRILHO que percorre: div .pax-sheen com gradiente claro, `mask-image: url(mesmo PNG)` e
  `mix-blend-mode: screen`, animando background-position vertical (PAXTER->Clinical). A mascara
  e o proprio PNG transparente => a luz so aparece sobre as letras. Respeita prefers-reduced-motion.
- VIDRO (glassmorphism: backdrop-filter blur + bg translucido escuro + borda/realce) SO no
  SIMBOLO; NUNCA na palavra (ordem explicita do CEO).
- Arquivos: assets em `src/assets/brand/paxter-{headline,paxter,precision,subtitle}.{png,webp}`;
  componente `src/components/branding/PaxterLogo.tsx` (variant hero/compact) + `.css`. Convive
  com o lockup do sidebar `components/layout/PaxterLogo.tsx` (nao substituir sem ordem).
  Hero aplicado em `pages/abertura.tsx`. A imagem chapada inteira (remendo) foi descartada.
- Vetorizacao manual fiel das letras (etapa B) segue futura e separada; NAO bloqueia o lockup atual.

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
