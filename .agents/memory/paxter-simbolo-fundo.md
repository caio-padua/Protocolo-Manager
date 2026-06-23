---
name: Simbolo Paxter — fundo embutido e icones PWA
description: O PNG do simbolo tem fundo escuro embutido; como evitar o "apagado" e como gerar os icones do app.
---

# Simbolo PAXTER em superficies escuras + icones PWA

`paxter-symbol.png` (em `artifacts/padcom/src/assets/` e tambem no mockup-sandbox) NAO e
transparente: o ouro vem sobre um fundo escuro texturizado embutido. Colado direto numa
sidebar navy, esse fundo aparece como uma mancha escura e o simbolo parece "apagado".

**Regra:** sobre superficie escura, renderizar o `<img>` com `mixBlendMode: "screen"`
(opcional `filter: brightness(~1.2) drop-shadow(ouro)`). O screen apaga o preto do PNG e
deixa so o ouro, brilhante. Vale para o tone dark e tambem dentro do medalhao navy do
tone light em `PaxterLogo.tsx`.

**Why:** o CEO reclamou que o simbolo no canto superior esquerdo ficava "apagado"
(22/06/2026). A causa nao era tamanho, era o fundo escuro do PNG somando com a sidebar.

**Icones do PWA (manifest):** devem ser SO o simbolo sobre fundo azul-marinho, nunca o
cartaz de marca inteiro (com wordmark/textos). Ja houve engano de gravar o cartaz inteiro
no `icon-512.png`. Pipeline: recortar o fundo do simbolo (background removal) ->
`magick -size NxN gradient:'#16284a-#0b1426' ( cut.png -resize ... ) -gravity center -composite`.
Arquivos: `icon-192`, `icon-512`, `icon-maskable-512` (mais padding p/ safe zone),
`apple-touch-icon` (180). ImageMagick v7 no repo: usar `magick` (o `convert` avisa deprecado).

**Fallback:** ambientes sem suporte a mix-blend-mode degradam; se isso virar problema,
trocar pelo PNG ja recortado (transparente) em vez do blend.

**Brilho CONTIDO (decisao do CEO 23/06/2026):** no SITE o brilho dourado nao pode lavar/mudar
a caracteristica do painel navy ao redor (CEO viu o ouro "iluminando a base" na sidebar e no
hero). O RECORTE do simbolo vem do `mix-blend-mode: screen`, NAO do brilho — entao da p/
reduzir/eliminar drop-shadow e radiais douradas (halo) sem quebrar o recorte. Conter = halo
curto e de baixa opacidade (ex.: `drop-shadow(0 2px 7px rgba(214,176,92,0.22))`), radial gold
do hero baixa (~0.07) e pequena, e tirar o radial-wash atras do logo da sidebar.
**Why:** drop-shadow/radial espalham luz sobre o navy; screen so apaga o preto do PNG.

**Site x app — onde cada acabamento mora:** no SITE o simbolo e CHAPADO (mesmo plano do
wordmark, estilo PAWARDS) = variante `hero` em `PaxterLogo.tsx` (sem vidro/bevel). O vidro/bevel
(medalhao) fica SO na variante `compact` (app, anamnese, marcacao).

**O "fundo escuro" e INTEGRAL ao logo, nao da p/ recortar:** o simbolo e uma placa/tile
de moldura dourada com MIOLO escuro (o R/X em ouro sobre fundo escuro DENTRO da moldura).
Background removal so tira o que esta FORA da moldura; o miolo escuro permanece (faz parte
do desenho). Por isso "deixar transparente" nao resolve um flash que cruza o tile.

**Nao varrer o tile inteiro com flash/sweep (mix-blend screen + brightness):** um sweep
movel sobre o simbolo CLAREIA o miolo escuro de forma visivel, dando a impressao de que a
COR DO FUNDO da tela mudou. CEO reclamou (22/06/2026, "importantissimo"). Correcao: simbolo
ESTATICO (so aura radial suave atras, que nao levanta o miolo) e colocar o brilho periodico
numa OUTRA peca (a placa boton "PAXTER" do rodape), nunca sobre o tile.
**Why:** o miolo escuro vira "tela de cinema" do flash e parece troca de cor de fundo.

**REVERSAO p/ a SIDEBAR do app (decisao do CEO 23/06/2026):** na barra lateral do `padcom`
o CEO agora EXIGE que a faixa de luz ("o sol") passe TAMBEM no simbolo (antes so passava no
wordmark). Isso NAO contradiz a regra acima quando o sheen e MASCARADO so no ouro: gerar uma
versao RECORTADA do simbolo (`assets/brand/paxter-symbol-cut.png` via background removal) que
nesse asset fica praticamente line-art de ouro (sem placa/miolo escuro visivel na navy), e
mascarar o `.pxs-sheen` por essa alpha (`mask-image: url(cut.png)`). Assim a luz so toca o
ouro — o fundo navy nao e clareado, evitando o "troca de cor de fundo" de 22/06. O simbolo
recortado tambem dispensa o `mix-blend screen` (some o halo que "lavava" o navy — outra
queixa do CEO). Sheen LENTO (~8s) e simbolo MAIOR/proporcional. Arquivos:
`components/layout/PaxterLogo.{tsx,css}` (classes `.pxs-`), `Layout.tsx` (sidebar retratil).
**Why:** a regra-raiz e "luz nunca clareia area escura/fundo"; mascarar no ouro satisfaz
isso E o pedido de varrer o simbolo. Conferir SEMPRE por screenshot se o cut nao deixou
mancha escura; se deixar (placa/miolo opaco), voltar ao simbolo estatico.

**Simbolo-botao do app/anamnese = PaxterSymbolPremium DENTRO do vidro (CEO 23/06/2026):**
no cabecalho da anamnese/app o simbolo NAO pode ser um vidro chapado vazio nem so o PNG
estatico — tem de ser o componente `_shared/PaxterSymbolPremium.tsx` (aura pulsante + FAIXA
de luz cruzando o metal + FAISCA fina correndo o contorno, usa `paxter-symbol-cut.png`),
colocado DENTRO do medalhao de vidro/bevel (o "vidro que engloba a moldura em ouro"). As
FRASES (PAXTER + Clinical em ouro recortado, com sheen) ficam separadas e seguem como estao.
No mockup isso vive na variante `appHeader` de `mockup-sandbox/.../_shared/PaxterLogo.tsx`.
**Why:** ao trocar o logo pelo lockup raster aprovado eu substitui o simbolo-premium por um
vidro vazio e os "efeitos que passamos o dia criando" sumiram; o CEO cobrou a perda. O
PaxterSymbolPremium ja e o simbolo canonico aprovado (tambem usado em `anamnese-paxter`).
**How to apply:** em qualquer header de app/anamnese, simbolo = PaxterSymbolPremium dentro
do medalhao de vidro; nunca o `.pax-symbol` chapado sozinho. Conferir por screenshot.

**Sidebar do app e PURA (CEO 23/06/2026):** o topo da sidebar mostra SO o lockup oficial
(simbolo + "PAXTER" + "Clinical Intelligence System"); REMOVIDO o bloco de texto "Motor
Clinico / Protocolos Injetaveis" ("papagaiada de motor/engine", palavras do CEO). Tagline
travada = "Clinical Intelligence System" (versao pura, sem sub-linha de engine/motor).
