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
  e RECORTADA do PNG-mestre (`attached_assets/LOGO_PAXTER_0_(PRINCIPAL)...png`, 1122x1402,
  ouro sobre quase-preto) e tem SO o fundo preto removido, preservando o ouro 3D.
- ARMADILHA (corrigida 23/06/2026): NAO usar luminancia->alfa suave (`-level 10%,100%`) para
  tirar o fundo. Isso mapeia o MIOLO do dourado (luminancia media) para semi-transparente; o
  navy do site vaza por baixo e o ouro vira PRATA/lavado (o CEO reclamou: "PAXTER nao esta
  dourado como o simbolo"). CERTO = level INGREME que so derruba o preto e mantem o ouro 100%
  opaco: `magick M -crop LxH+0+Y +repage \( +clone -colorspace Gray -level 10%,16% \) -alpha off
  -compose CopyOpacity -composite -trim +repage out.png`. Faixas Y do mestre: PAXTER ~640-800,
  Clinical ~850-895, PRECISION ~995-1035, AI-guided ~1065-1095 (cortar bandas generosas e -trim).
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

**REJEITADO em definitivo (NAO reusar):** `_shared/PaxterLogoVector.tsx` + `paxterVectorPaths.ts`
+ `scripts/trace-paxter.cjs` (potrace). Tanto o tracing automatico quanto o wordmark vetorial
desenhado a mao foram reprovados pelo CEO. NAO renderizar a marca por vetor/fonte. Se aparecer
PAXTER serrilhado OU geometrico-sem-serifa numa tela, esta com a versao errada.

**How to apply (o jeito CERTO, em producao):** usar o LOCKUP RASTER `PaxterLogo` (variant
hero/appHeader/compact/wordmark) que renderiza as fatias `assets/brand/paxter-{headline,paxter,
precision,subtitle}.{png,webp}`. O componente existe no padcom (`components/branding/PaxterLogo`)
e foi ESPELHADO no mockup-sandbox (`_shared/PaxterLogo.tsx`+`.css`) p/ as telas de anamnese.
- `appHeader` = simbolo em vidro + bloco `headline` (PAXTER+Clinical) com `.pax-sheen` percorrendo.
- A palavra usa `mix-blend-mode: screen`: o fundo da fatia NAO e preto puro, entao em fundo navy
  (ou medalhao) o screen apaga o escuro e o ouro salta. No TEMA CLARO, por a logo numa PLACA navy
  (o screen so funciona sobre escuro); sem a placa o ouro some no creme.
- Ambos artifacts usam alias `@`=src, entao os imports `@/assets/...` funcionam ao copiar o arquivo.
- Vetorizacao manual fiel (etapa B) segue futura; ate la, o raster e a marca oficial.
