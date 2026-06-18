---
name: Orcamento - consistencia de calculo Montagem x Apresentacao
description: Por que a Apresentacao precisa reidratar volumeTiers do catalogo antes de recalcular o orcamento.
---

O snapshot do orcamento (`BudgetItem` salvo) NAO persiste `volumeTiers` (override de
escada de volume por substancia). O motor `budget-calc` aceita `volumeTiers` por item;
quando ausente, usa a escada GLOBAL do `budget_settings`.

**Regra:** qualquer tela que recalcula um orcamento ja salvo (ex.: Apresentacao) deve
reidratar `itemVolumeTiers` a partir do catalogo atual por `catalogId` antes de chamar
`/budgets/calculate`. Caso contrario, um item com override mostra total/ancoragem
diferente entre Montagem (que envia o override) e Apresentacao.

**Why:** sem isso, o preco do protocolo (volumeDiscountedCents) e os cenarios A/B/C
divergem entre as duas telas para itens com escada propria.

**How to apply:** mapear catalogo -> Map(catalogId -> itemVolumeTiers) e passar no
payload de items. Alternativa de longo prazo: persistir volumeTiers no snapshot do item.
