---
name: Cascata sinapses + IA 1/2/3 (isolada e desativada)
description: decisões da cascata de atendimento ainda NÃO ligada a nenhum webhook
---
Cascata (sinapse exata -> IA1 -> IA2 -> IA3 -> fila de revisão ratificar/retificar) existe só como módulo + rotas de fila; nenhum webhook a chama. Modo só "desligado"/"sombra"; "ligado" é tratado como desligado.
**Why:** Dr. Caio ordenou que as 3 IAs só ativem depois dos testes reais aprovados da Dayana e da Carlúcia.
**How to apply:** não ligar ao webhook nem enviar nada sem essa liberação. Ratificar exige confirmar=true, admin, mesma clínica, resposta segura e sem conflito; retificar desativa (nunca apaga) e só guarda rascunho. Urgência/conduta clínica = regra fixa para humano, sem IA. Avaliar custo por tokens medidos (amostra: src/scripts/amostra-cascata-ia.ts).
