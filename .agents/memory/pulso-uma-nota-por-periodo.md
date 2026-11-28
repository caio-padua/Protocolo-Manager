---
name: Pulso — uma nota por período
description: manhã=sono da noite passada, tarde=energia, noite=libido; prazos; documento oficial em docs/parametrizacoes-gerais
---
Regra oficial em docs/parametrizacoes-gerais/pulso-diario.md (pasta "Parametrizações Gerais", uma regra por arquivo). Libido não avaliada à noite só volta na manhã seguinte e é gravada na noite de ontem; depois disso o prazo acaba.

**Why:** pedido do CEO (22/11/2026); mensagem ambígua ("como foi seu sono esta noite") foi corrigida: todo texto diz a data/momento a que a nota se refere.
**How to apply:** regra duplicada em pulso-perguntas.ts (servidor), MeuPulsoCliente e mini app Telegram; mudou uma, mude as três e o teste. Lembrete automático só dispara com o worker completo.
