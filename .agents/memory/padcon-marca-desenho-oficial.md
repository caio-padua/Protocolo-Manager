---
name: Marca PADCON = desenho oficial recortado (nao texto, nao placa)
description: Como renderizar a marca PADCON (empresa de engenharia) com fidelidade — diferente do PAXTER.
---

# PADCON na UI = o DESENHO OFICIAL recortado, nunca texto digitado

Decisão do CEO (Dr. Caio): quando aparecer a marca **PADCON** (a empresa de
engenharia, no crédito "Engineered by"), tem que ser o **desenho oficial real**
(logo ouro), não a palavra digitada e não sobre placa.

**Distinção importante:**
- **PAXTER** = wordmark VETOR (desenhado, Cinzel + ouro 3D via clip). É o sistema.
- **PADCON** = recorte da ARTE OFICIAL (`attached_assets/LOGO_PADCON_17_(oficial)_*.png`),
  com fundo removido (PNG transparente), renderizado FLUTUANDO (sem placa/painel).
  Não existe vetor traçado fiel (potrace saiu ondulado e foi abandonado); por isso
  a fonte de verdade é a imagem oficial recortada, não letras digitadas.

**Implementação atual:** recorte da palavra PADCON da arte oficial -> remove fundo ->
`artifacts/padcom/src/assets/padcon-wordmark.png` (transparente) -> componente
`PadconWordmark.tsx` renderiza `<img height=...>` (prop `height`), importando o asset
via `@/assets/...` para o Vite resolver a URL.

**Why:** o CEO rejeitou explicitamente (1) texto digitado "PADCON", (2) marca sobre
placa navy, (3) subtítulo "Atendimento clínico" sob "Instituto Pádua". Exige o
desenho real.

**How to apply:** reusar `PadconWordmark` (imagem) em qualquer crédito PADCON; nunca
recriar com texto/clip de gradiente; nunca pôr placa atrás; se precisar de versão
maior, gerar recorte da arte oficial (símbolo + wordmark) e remover fundo de novo.

## Símbolos: dois caminhos (img recortado vs. máscara CSS)

- **PADCON símbolo** (nó entrelaçado, render polido 3D): `PadconSymbol.tsx` = `<img>`
  do recorte oficial com fundo removido (`padcon-symbol-gold.png`). O render 3D
  polido NÃO pode virar máscara (perderia o relevo/brilho).
- **PÁDUA símbolo** (monograma D+P, line-art oficial preto sobre branco): `PaduaSymbol.tsx`
  = a arte oficial usada como **CSS mask** (`-webkit-mask-image`/`mask-image`) sobre um
  fundo de **gradiente ouro escovado** (`repeating-linear-gradient` de estrias finas +
  `linear-gradient` ouro) com `drop-shadow` para relevo. Assim o desenho fica IDÊNTICO
  à arte aprovada — sem redesenho à mão — só trocando preto por ouro. Use máscara só
  quando a arte de origem é traço/silhueta chapada (não render 3D).

**Preparo dos assets (magick):** line-art preto→máscara: `magick in.png -fuzz 35%
-transparent white -trim +repage out.png` (preto fica opaco, branco vira transparente).

**Verificar remoção de fundo por alpha, não a olho:** o visualizador de imagem compõe
PNG transparente sobre PRETO, então um asset já recortado PARECE ter fundo preto. Confirmar
de verdade com `magick a.png -format "%[pixel:p{2,2}]" info:` → `srgba(0,0,0,0)` = canto
transparente (fundo realmente removido). Não confiar na inspeção visual.

**Decorativo:** quando o símbolo aparece ao lado do nome em texto (ex.: PaduaSymbol +
"INSTITUTO PÁDUA"), marcar o símbolo `aria-hidden` para não duplicar leitura no leitor de tela.
