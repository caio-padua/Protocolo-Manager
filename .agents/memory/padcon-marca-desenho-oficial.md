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

## PÁDUA wordmark = logo oficial "Logotipo 4" recortada (não fonte serifada)

Decisão do CEO: o Instituto Pádua tem que aparecer com a logo OFICIAL real, igual o
PADCON — não com a palavra "PÁDUA" digitada em fonte serifada.

- **Fonte de verdade do wordmark Pádua:** `IMG_9742` ("Logotipo 4") = "INSTITUTO PÁDUA"
  em OURO sobre preto (já é a arte aprovada, dourada — não precisa recolorir). NÃO usar
  `IMG_5683` (é só print de WhatsApp do fornecedor de placa, preto sobre branco).
  `IMG_9743` ("Logotipo 3") = só o monograma D+P (vira a máscara do `PaduaSymbol`).
- **Extração:** recortar a região do wordmark do IMG_9742 (`magick ... -crop`), remover
  fundo → `artifacts/padcom/src/assets/padua-wordmark.png` (transparente); componente
  `PaduaWordmark.tsx` = `<img height=...>`, espelhando `PadconWordmark`.
- **Rodapé da anamnese-v2:** as DUAS marcas seguem o mesmo padrão símbolo + wordmark:
  esquerda = `PaduaSymbol` + `PaduaWordmark`; direita = `PadconSymbol` + `PadconWordmark`.

**Validar recorte dourado-sobre-preto:** compor o PNG transparente sobre navy E sobre
creme (`magick -size WxH xc:COR logo.png -gravity center -composite`) e olhar — o ouro
tem que ler bem nos dois temas (claro/escuro). Canto alpha=0 confirma fundo removido.

## Aparar margem: prop `height`/`size` SÓ vira tamanho real se o PNG estiver trimado

Cada PNG recortado pode ter uma margem transparente DIFERENTE (ex.: wordmark Pádua tinha
desenho em só 52% da altura, PADCON wordmark 61%, símbolo PADCON 80%). Como o `<img>`
escala o CANVAS inteiro (margem + desenho), pedir `height={40}` num arquivo com 50% de
margem renderiza letras de ~20px. Resultado: num lockup [símbolo][nome] o símbolo (sem
margem) esmaga o nome (com margem) e fica desarmônico, mesmo com números "parecidos".

**Regra:** antes de usar como `<img height=...>`, aparar a margem para o bounding box do
conteúdo — `magick in.png -trim +repage out.png` — assim `height` = altura visível real.
Conferir com `magick f.png -trim +repage -format "%wx%h" info:` (conteúdo) vs `identify`
(canvas); se diferirem muito, ainda há margem.

**Proporção de lockup harmônico (rodapé anamnese-v2, após trim):** símbolo só um pouco
maior que o nome (~1,2–1,7x), não 2–3x. Pádua (clínica, principal, esquerda) maior;
PADCON ("Engineered by", crédito, direita) menor. Verificar SEMPRE por screenshot do
rodapé (modo foco encurta a página e expõe o footer).
