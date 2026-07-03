---
name: Lembrete de fórmula manipulada (descrição rica)
description: Como os lembretes por período descrevem fórmulas manipuladas e de onde vêm os campos
---

# Lembrete de fórmula manipulada — fonte e enriquecimento

Regra: a descrição da fórmula manipulada no lembrete por período (nome, ativo principal,
apresentação/dose, via, observação de refeição, posologia) é derivada da cadeia
anamnese → `item_doenca` (tipo `formula`) → `catalogo_formulas`, parseando as linhas
`TITL` / `SUBS*` / `VIA` / `APRE` / `POSO*` / `OBS`.

**Nome canônico = `TITL` do catálogo** (fonte de verdade), com fallback para `item_nome` e
depois `item_ref`. Não priorizar `item_nome` — ele pode ser genérico/legado ou nulo.

**Why:** o objetivo do CEO é que o lembrete siga o padrão de descrição da própria fórmula
manipulada; o catálogo é a fonte autoritativa, `item_doenca` só faz o vínculo doença→item.

**How to apply:** ao mexer em `enriquecerItemFormula`/`derivarFormulasLembrete`
(`artifacts/api-server/src/lib/formula-manipulada.ts`), manter TITL como nome primário.
O caminho real do cron (`cockpit.ts`) enriquece só fórmulas — injetável/exame ficam intactos.
A galeria de demo deve usar a cadeia real (derivar → `sincronizarLembretePrescricao` → ler
períodos persistidos), não `montarPeriodos` direto (que era o caminho "amnésico").

**Armadilha de dado:** `catalogo_formulas` guarda texto em MAIÚSCULO e SEM acento. Portanto
"Formula Reposicao Mineral Base" é o melhor possível — perda de acento é do dado de origem,
não bug. Humanização: Title Case para ativos (unidades minúsculas), caixa-de-frase para
apresentação/posologia/observação.
