---
name: Frequência cardíaca do Pulso — 3 níveis
description: limites e fonte da classificação de frequência cardíaca no Meu Pulso; dados demo de 60 dias
---
Frequência cardíaca em repouso tem 3 níveis (baixa <50, normal 50–99, alta ≥100), não 5 como pressão e glicemia.
**Why:** Diretriz SBC de laudos de ECG 2022 define bradicardia sinusal <50 e taquicardia sinusal ≥100 (normal em vigília 50–99). O médico pediu "alto, baixo ou médio"; "médio" = Normal.
**How to apply:** limites vivem em LIMITES.frequencia (pulso-faixas.ts); muito baixa/muito alta não existem para FC (sem fonte). Dados demo (origem 'demo') de clientes 11 e 12: 60 dias, 4 fases discrepantes; upsert só sobrescreve origem 'demo', preserva registros reais (telegram).
