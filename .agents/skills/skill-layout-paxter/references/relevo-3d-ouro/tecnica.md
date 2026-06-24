---
name: Relevo 3D dourado de TEXTO / wordmark (tecnica reproduzivel)
description: Receita testada para renderizar texto/selo em ALTO-RELEVO 3D dourado (ex.: "PAXTER" no topo claro) sem o contorno "carcomido". 3 camadas (parede/face/halo), valores que funcionaram e armadilhas. Ler ANTES de mexer em wordmark/selo dourado em relevo.
---

# Relevo 3D dourado de TEXTO / wordmark

Custou ~2 dias de ajuste fino (junho/2026). Esta pagina e o seguro contra repetir isso: a
receita FINAL aprovada pelo CEO, com os valores exatos, o porque de cada escolha e as armadilhas.
Vale para qualquer TEXTO, SELO ou WORDMARK que precise saltar da folha em ouro no tema CLARO.

Componente vivo (fonte do codigo): `artifacts/padcom/src/components/layout/paxter-fx/PaxterWordmarkPremium.tsx`.
Aplicado em: topo da anamnese do cliente `/anamnese/v2` (tema claro, fundo creme "tecido de terno").

## O problema (ver imagem) — contorno "carcomido"

Imagem `antes-carcomido.jpg` (foto do CEO): o contorno das letras ficou serrilhado, como se
tivesse sido **mordido por um alicate de unha**. Causa-raiz:

| Causa | Por que vira "dente" |
|---|---|
| Letras sao VETOR de potrace (tracado automatico) | o caminho tem micro-ondulacoes; nao e geometria limpa |
| Delimitavamos o ouro com um STROKE escuro grosso | o stroke SEGUE cada ondulacao do vetor -> a serra aparece |
| Parede 3D feita com POUCAS copias grossas | cada copia deslocada vira um degrau (escadinha) |

Regra-mae: **nunca delimitar letra de potrace com stroke escuro grosso.** A borda tem que
nascer de RELEVO real + um halo SUAVE, nunca de uma linha desenhada.

## A solucao — 3 camadas (de tras para a frente)

Resultado liso em `depois-completo.jpg` e detalhe ampliado em `depois-zoom.png`.

Blueprint do empilhamento:

  PAREDE (extrusao + blur)  ->  FACE (ouro, sem stroke)  ->  HALO + LUZ (filtro)

| Camada | O que e | Como se faz |
|---|---|---|
| 1. PAREDE (espessura 3D) | a lateral do relevo | muitas copias FINAS das letras em degrade escuro, cada uma um tico mais p/ baixo+direita; um blur leve funde tudo numa parede continua |
| 2. FACE (a frente) | o topo dourado da letra | letras em degrade ouro, SEM stroke duro, juncoes arredondadas |
| 3. HALO + LUZ | separa o ouro do creme e da volume | drop-shadow SUAVE em halo (substitui o stroke) + luz no topo + sombras de profundidade embaixo |

## Valores que funcionaram (tema CLARO)

| Parametro | Valor final | Por que |
|---|---|---|
| Extrusao: numero de copias | 26 copias finas | poucas copias = degraus; muitas finas = parede lisa |
| Extrusao: passo por copia | x = k * 0,22 ; y = k * 0,62 | deslocamento p/ baixo+direita (luz vem de cima-esquerda); de tras p/ frente |
| Esmeril da parede (filtro `fWall`) | `feGaussianBlur stdDeviation=0,7` | funde o que sobrou de degrau entre as copias |
| Stroke da FACE (claro) | `none` (faceStroke none) | era a causa do "carcomido"; removido |
| Contorno SUAVE (no filtro `fLift`) | halo `dx0 dy0 std0,9 #3a2206` + sombra curta `dy0,7 std0,6 #241000` | delimita o ouro do creme SEM dentes |
| Junçoes da face | `strokeLinejoin/Linecap = round` (so no claro) | arredonda cantos; no escuro fica `undefined` (original) |

## Armadilhas (NAO fazer)

| Nao faca | Faca |
|---|---|
| Stroke escuro grosso p/ "contornar" o ouro | halo suave (drop-shadow) + relevo real |
| Poucas copias grossas na extrusao | muitas copias finas + blur leve |
| Mexer no TEMA ESCURO | extrusao, halo e arredondamento rodam SO no claro (prop `tone`, default `dark`); escuro intacto |
| Forkar o motor de luz (traceFlash / PaxterGlintPremium) | estender por props opcionais; motor de luz e UNICO |
| Achar que `200 OK` / typecheck verde prova o visual | conferir por SCREENSHOT ampliado (recorte 3-4x do topo) |

## Como conferir (esmeril honesto)

1. Screenshot da pagina no claro (ex.: `/anamnese/v2?demo=1` no celular 390x844).
2. Recortar e AMPLIAR so o wordmark (ex.: `magick foto.jpg -crop 300x70+45+150 +repage -resize 420% zoom.png`).
3. Olhar o contorno de perto: tem que estar LISO, sem serra. So entao dar por pronto.

## Por que isto vale a pena guardar

O ouro encosta no creme no tema claro e a borda "some" — a tentacao imediata e desenhar uma
linha escura. Em vetor de potrace essa linha vira serra. A saida correta e mais trabalho de
RELEVO (parede + halo), nunca uma linha. Esta pagina existe para o proximo agente comecar DAQUI,
nao do zero.
