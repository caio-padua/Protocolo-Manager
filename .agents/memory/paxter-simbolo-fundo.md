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
