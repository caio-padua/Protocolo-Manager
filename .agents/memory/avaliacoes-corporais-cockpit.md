---
name: Avaliações corporais do Cockpit
description: Seis avaliações (bioimpedância, antropometria, dinamometria, calorimetria, ultrassom, outras) com catálogo único front/back
---
Catálogo de campos, limites e derivados mora em lib/avaliacoes-corporais; a tela monta o formulário e o servidor valida pelo mesmo arquivo. Tabela client_avaliacoes, remoção só por deleted_at. Derivados (IMC etc.) calculados na leitura, nunca gravados.
**Why:** o CEO exigiu campos vazios (sem dado fictício) e conteúdo real, não só tela.
**How to apply:** novo campo = só no catálogo; nunca pré-preencher; erro de leitura ≠ lista vazia.

O índice de massa corporal usa faixas gerais de adultos como referência, não como diagnóstico. A classificação não é adequada a menores de 18 anos, gestantes ou lactantes; pessoas acima de 65 anos e outros grupos exigem interpretação individual.
**Why:** a referência adotada exclui esses grupos ou exige cautela, e nem sempre o sistema conhece gestação e amamentação.
**How to apply:** conferir idade na data de cada medição; não classificar se houver idade desconhecida ou menor de 18 anos; explicar que gestação e amamentação devem ser verificadas pelo profissional. Não inventar faixas para outras medidas.
