---
name: Wordmark PAXTER em relevo 3D dourado (usar a ARTE OFICIAL, nao redesenhar)
description: Como exibir o "PAXTER" em alto-relevo 3D dourado liso, no claro e no escuro. Regra-mae: usar a ARTE OFICIAL (PNG), NUNCA um SVG redesenhado por traco automatico (potrace). E como tratar a sombra preta embutida do PNG no fundo claro. Ler ANTES de mexer no wordmark.
---

# Wordmark PAXTER em relevo 3D dourado

Custou ~2 dias de tentativa-e-erro (junho/2026). Esta pagina e o seguro contra repetir isso.
O CEO reprovou varias rodadas com o contorno do "P" serrilhado, como **mordido por alicate de
unha** ("carcomido"). A causa real so apareceu quando comparamos lado a lado.

Aplicado em: topo da anamnese do cliente `/anamnese/v2` (`BrandMark` em `pages/anamnese-v2/index.tsx`).

## As DUAS armadilhas (e as imagens que provam)

| # | Armadilha | Imagem | O que se via |
|---|---|---|---|
| 1 | Redesenhar o wordmark com SVG por traco automatico (potrace) | `antes-carcomido.jpg` | contorno ondulado/serrilhado de origem; nenhum filtro conserta uma copia ruim |
| 2 | Usar a arte oficial PNG crua sobre fundo CLARO | `problema-halo-preto.png` | a sombra preta EMBUTIDA no PNG (drop-shadow p/ fundo preto) vira fumaca preta serrilhada em volta das letras sobre o creme |

Resultado correto: `depois-limpo.png` — letras douradas, contorno liso, bisel 3D real, sem fumaca.

## Regra-mae

1. **Nunca redesenhar o wordmark** (nem por potrace/SVG, nem por fonte tipografica). Existe ARTE
   OFICIAL aprovada — use-a. Pecas em `artifacts/padcom/src/assets/brand/` (`paxter-paxter.*` = so
   "PAXTER"; `paxter-headline.*` = PAXTER + subtitulo). Catalogo em `references/marca/marca.md`.
2. A arte oficial PNG tem **sombra preta embutida** (drop-shadow). Isso e otimo no ESCURO (some no
   navy) e RUIM no CLARO (aparece como halo/fumaca sobre o creme).

## Receita por tema (a que ficou aprovada)

  TEMA ESCURO (navy)  ->  PNG oficial cru (paxter-paxter.png/webp): a sombra embutida fica bonita
  TEMA CLARO (creme)  ->  versao SEM o halo (paxter-paxter-clean.png): arte oficial com o fundo/
                          sombra removidos (ferramenta de remover fundo), so as letras douradas

| Tema | Asset | Por que |
|---|---|---|
| Escuro | `paxter-paxter.png` / `.webp` (oficial) | a sombra escura embutida da profundidade sobre o navy |
| Claro | `paxter-paxter-clean.png` (sem halo) | sem a sombra preta que sujaria o creme; contorno da arte oficial = liso |

Como a versao limpa foi gerada: ferramenta de remover fundo aplicada sobre `paxter-paxter.png`,
salvando `paxter-paxter-clean.png`. Mantem as letras + bisel; remove a sombra projetada.

No codigo (`BrandMark`): escolha por `tone` — `light` usa `<img>` da versao clean; `dark` usa
`<picture>` (webp+png) da oficial. Tamanho `width: 168`.

## Como conferir SEM depender do screenshot da tela

Quando a captura da tela falhar, componha a arte sobre o fundo do tema e amplie o "P":

```
cd artifacts/padcom/src/assets/brand
magick -size 1019x172 gradient:"#efe6d2"-"#ddcdae" /tmp/bg.png            # creme da anamnese
magick /tmp/bg.png paxter-paxter-clean.png -gravity center -composite /tmp/comp.png
magick /tmp/comp.png -crop 280x172+0+0 +repage -resize 250% /tmp/zoom_P.png
```

Olhar `/tmp/zoom_P.png`: o contorno tem que estar LISO e SEM fumaca preta. So entao dar por pronto.

## A LUZ (sol/polvora) sobre a arte raster — sem serrilhar

A arte oficial e raster (PNG), nao tem paths para o motor SVG (`PaxterGlintPremium`) percorrer.
Se voce tentar reusar o motor SVG, ele recorta a luz pelos paths do **potrace** (ondulados) e os
RAIOS saem serrilhados ("carcomido nos raios"). Errado.

Caminho certo (mesmo do `.symbol-glint` do rodape): a luz e uma faixa CSS que varre por cima da
imagem, **recortada pela propria arte LIMPA** via `mask-image: url(paxter-paxter-clean.png)` +
`mix-blend-mode: screen`. Como a mascara e a silhueta lisa, os raios saem lisos. Componente:
`PaxterWordmarkArt.tsx`. Duas camadas: a "polvora" (faisca fina, corre antes) e o "sol" (faixa
larga especular). A mascara e SEMPRE a versao clean (mesmo no escuro), para a luz nao vazar na
sombra embutida da arte oficial.

Timing (psicologia de atencao / luxo): ciclo de **12s IGUAL** ao do simbolo e do subtitulo
(`PaxterTextShimmer`), para nunca derivarem entre si (sincronia = sem piscar irregular). Fases
travadas nas do motor: polvora ~2->24%, sol 26->48%, resto e descanso (evento curto + descanso
longo = contencao de luxo). `cycleDelay` faz a luz descer simbolo -> nome -> frase (cascata).

## Por que guardar isto

A tentacao a cada rodada e "melhorar o filtro" do desenho serrilhado. Isso nunca conserta, porque o
problema e a FONTE do desenho (copia potrace) e a sombra embutida do PNG. O caminho certo e sempre:
ARTE OFICIAL; no claro, ARTE OFICIAL SEM o halo. Comece DAQUI, nao do zero.
