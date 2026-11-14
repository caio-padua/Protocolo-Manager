---
name: Avaliações corporais do Cockpit
description: Seis avaliações (bioimpedância, antropometria, dinamometria, calorimetria, ultrassom, outras) com catálogo único front/back
---
Catálogo de campos, limites e derivados mora em lib/avaliacoes-corporais; a tela monta o formulário e o servidor valida pelo mesmo arquivo. Tabela client_avaliacoes, remoção só por deleted_at. Derivados (IMC etc.) calculados na leitura, nunca gravados.
**Why:** o CEO exigiu campos vazios (sem dado fictício) e conteúdo real, não só tela.
**How to apply:** novo campo = só no catálogo; nunca pré-preencher; erro de leitura ≠ lista vazia.
