---
name: Orcamentos "Console Clinico" (tela Montagem do Orcamento)
description: Decisoes nao-obvias da reforma visual da tela de orcamento (DigitalDisplay/FrequencyDial) e armadilhas ARIA/dose.
---

# Tela Montagem do Orcamento — conceito "Console Clinico"

Reforma puramente visual/interativa de `artifacts/padcom/src/pages/orcamentos/novo.tsx`. Componentes irmaos na mesma pasta: `DigitalDisplay.tsx` (mostrador retroiluminado petroleo, tons cyan/emerald/amber/slate, sizes sm..xl, flash via `key={value}`) e `FrequencyDial.tsx` (display + setas + trilha de ticks; exporta tambem `FREQ_STOPS`).

## Decisao: dose exibida != dose salva (intencional)
A tela exibe a dose como read-only vinda do catalogo de substancias (`substance.defaultDose || substance.posologia || r.dose`), mas `salvar()` continua persistindo `r.dose` (dose do catalogo de orcamento).
**Why:** o pedido do CEO exigia "motor de calculo e payload de salvar INTACTOS"; so a apresentacao mudou. Logo a divergencia display-vs-payload e proposital, NAO um bug a "consertar".
**How to apply:** se um dia for preciso persistir exatamente a dose exibida, fazer como tarefa separada (afeta o snapshot salvo do orcamento/apresentacao).

## Relevo 3D: classes UNLAYERED para vencer utilitarios Tailwind/shadcn
As classes de relevo (`panel-3d`, `panel-3d-sub`, `panel-3d-hero`, `panel-3d-active`, `field-engraved`) ficam no FIM de `index.css` FORA de qualquer `@layer`. CSS sem layer vence todas as camadas do Tailwind v4, entao sobrepoe `bg-card`/`shadow-sm`/`rounded-*`/`border` do shadcn `Card` de forma previsivel sem `!important`.
**Why:** aplicar relevo direto num `<Card>` shadcn falha se feito por utilitario, pois a camada utilities do Tailwind venceria; unlayered resolve. Estado "selecionado" usa `panel-3d-active` (definida DEPOIS de `panel-3d`) porque `ring`/`border-l` utilitarios seriam anulados pelo `box-shadow`/`border` da propria classe.
**How to apply:** so atuam quando a classe e aplicada explicitamente (sem efeito colateral global). Para replicar o 3D em outras telas, basta por a classe no elemento; nao misturar com `shadow-*`/`bg-*`/`rounded-*` conflitantes no mesmo elemento. Radius adotado 14px/12px (mais premium que os 6px "quadrados" da marca) — desvio estetico autorizado pelo CEO ("assuma o melhor visualmente").

## Armadilha ARIA: role="slider" nao pode envolver filhos focaveis
No `FrequencyDial`, os ticks da trilha sao `<div>` clicaveis (mouse) com `aria-hidden`, NAO `<button>`. O container da trilha e que carrega `role="slider"` + `tabIndex=0` + `aria-valuetext` + setas do teclado.
**Why:** um `role="slider"` com `<button>` focavel dentro e ARIA invalido e gera tab-stops duplicados; foi o unico achado real do architect na reforma.
**How to apply:** padrao slider = um elemento focavel com valuetext/teclado; marcadores clicaveis ficam presentational (div + aria-hidden). Vale para qualquer seletor parecido.
