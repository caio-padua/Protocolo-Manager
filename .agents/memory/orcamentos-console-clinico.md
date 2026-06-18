---
name: Orcamentos "Console Clinico" (tela Montagem do Orcamento)
description: Decisoes nao-obvias da tela de orcamento (StatPanel/SessionStacker/FrequencyDial) e armadilhas ARIA/dose/navegacao.
---

# Tela Montagem do Orcamento — sub-blocos do item

Reforma puramente visual/interativa de `artifacts/padcom/src/pages/orcamentos/novo.tsx`. Cada item incluido mostra TRES paineis brancos de alto relevo lado a lado (Sessoes | Frequencia | Subtotal), que empilham no mobile, mais um banner de incentivo. Componentes irmaos na mesma pasta: `StatPanel.tsx` (painel branco de valor, tons teal/red/green/slate), `SessionStacker.tsx` (barra HORIZONTAL em degrade espectro) e `FrequencyDial.tsx` (setas nas extremidades + texto central + trilha de ticks; exporta `FREQ_STOPS` e `frequencyLabel`).

**Decisao durável (CEO):** abolido o visor digital escuro ("retroiluminado") — os numeros vivem em paineis brancos clean. Se reaparecer pedido de "mostrador escuro", e regressao do que o CEO mandou remover.

## Decisao: dose exibida != dose salva (intencional)
A tela exibe a dose no CABECALHO do item (read-only, vinda do catalogo de substancias: `substance.defaultDose || substance.posologia || r.dose`), mas `salvar()` continua persistindo `r.dose` (dose do catalogo de orcamento).
**Why:** o pedido do CEO sempre exige "motor de calculo e payload de salvar INTACTOS"; so a apresentacao muda. A divergencia display-vs-payload e proposital, NAO bug.
**How to apply:** persistir exatamente a dose exibida seria tarefa separada (afeta o snapshot salvo do orcamento/apresentacao).

## Relevo 3D: classes UNLAYERED para vencer utilitarios Tailwind/shadcn
As classes de relevo (`panel-3d`, `panel-3d-sub`, `panel-3d-hero`, `panel-3d-active`, `field-engraved`, `incentive-banner`, mais o par `concave-3d`/`screen-3d`) ficam no FIM de `index.css` FORA de qualquer `@layer`, com variante `.dark` correspondente. CSS sem layer vence todas as camadas do Tailwind v4, entao sobrepoe `bg-card`/`shadow-sm`/`rounded-*`/`border` do shadcn `Card` de forma previsivel sem `!important`.
**Why:** aplicar relevo direto num `<Card>` shadcn falha por utilitario (camada utilities venceria); unlayered resolve. `panel-3d-active` vem DEPOIS de `panel-3d` para vencer no cascade.
**How to apply:** so atuam onde a classe e aplicada explicitamente (sem efeito global). Nao misturar com `shadow-*`/`bg-*`/`rounded-*` conflitantes no mesmo elemento. Radius 14px/12px (mais premium que os 6px "quadrados" da marca) — desvio estetico autorizado pelo CEO.

## Vocabulario 3D do CEO: CONCAVO (rotulo afundado) vs CONVEXO (numero saltando)
Decisao estetica do CEO para a tela de orcamento: ROTULOS/titulos de bloco e o chip de dose usam `concave-3d` (sombra interna no topo = "entra na tela", como menu pressionado); NUMEROS (preco, frequencia read-only, subtotal, StatPanel, valor do SessionStacker) usam `screen-3d` (sombra externa profunda = "mini tela que sai da folha"). As barras de progresso (sessoes, frequencia, incentivo) sao SEGMENTADas em quadradinhos (`flex-1` + `gap-[3px]` + `rounded-[2px]/[3px]`), nunca barra continua/gradiente — visual "tecnologico" pedido pelo CEO.
**Why:** o CEO rejeitou cantos quadrados estilo Windows e barras lisas; quer relevo forte (sombra intensa, altura maior, arredondado) e numeros em destaque tatil.
**How to apply:** ao adicionar campo nessa tela, rotulo->concave, numero->screen, qualquer barra->segmentos. Preco e "por sessao" por extenso EMPILHADO (nunca "/ sessao").

## Chip de dose: so a magnitude, com guarda de overflow
No cabecalho, `doseMain = doseDisplay.split("—")[0].trim() || doseDisplay` mostra so a magnitude (ex.: "200 MG"), cortando a parte apos o travessao em-dash. O chip tem `max-w-[180px] truncate` + `title={doseDisplay}` para posologia longa sem travessao.
**Why:** sem o `|| doseDisplay`, dose sem em-dash sumiria; sem max-w, posologia longa estoura o cabecalho.

## Armadilha ARIA: role="slider" nao pode envolver filhos focaveis
Tanto em `SessionStacker` (barra) quanto em `FrequencyDial` (trilha), o elemento com `role="slider"` + `tabIndex=0` + teclado NAO contem filhos focaveis: os marcadores/preenchimentos sao `<div>` com `aria-hidden`. Botoes +/- ficam IRMAOS do slider, nunca dentro.
**Why:** slider com `<button>` focavel dentro e ARIA invalido e gera tab-stops duplicados.
**How to apply:** padrao slider = um focavel com valuetext/teclado; marcadores clicaveis ficam presentational (div + aria-hidden).

## FrequencyDial: navegacao por VALOR, nao por indice
As setas e o teclado caminham para o stop real (de `FREQ_STOPS` sem o `custom`) imediatamente menor/maior que o valor atual (`prevStop`/`nextStop` por `days`), nunca por `selected ± 1`.
**Why:** o stop "Eu digito" (custom) fica no FIM do array; navegar por indice a partir de um valor personalizado (ex.: 10 dias) saltava para 365 dias. So a busca por valor numerico da o vizinho correto.
**How to apply:** `indexFromValue`/`selected` continuam servindo so para destaque do tick e ARIA; quem decide o proximo valor das setas e a comparacao numerica de `days`.

## Volume por item alinhado por INDICE
`volumeByCatalogId` casa `result.items[idx]` com `includedRows[idx]` (mesma ordem do payload enviado ao motor). Se mudar a ordem/filtro de `includedRows` sem mudar o payload, o desconto por item desalinha.
