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

## Armadilha ARIA: role="slider" nao pode envolver filhos focaveis
No `FrequencyDial`, os ticks da trilha sao `<div>` clicaveis (mouse) com `aria-hidden`, NAO `<button>`. O container da trilha e que carrega `role="slider"` + `tabIndex=0` + `aria-valuetext` + setas do teclado.
**Why:** um `role="slider"` com `<button>` focavel dentro e ARIA invalido e gera tab-stops duplicados; foi o unico achado real do architect na reforma.
**How to apply:** padrao slider = um elemento focavel com valuetext/teclado; marcadores clicaveis ficam presentational (div + aria-hidden). Vale para qualquer seletor parecido.
