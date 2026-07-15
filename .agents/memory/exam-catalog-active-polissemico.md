---
name: active=false polissemico no catalogo de exames
description: Por que a lixeira de ignorados usa coluna propria ignored_at e nao active=false
---

Regra: em `exam_analyte_catalog`, `active=false` NAO significa "ignorado" — significa apenas "fora da lista". Tres causas distintas coexistem: (1) absorvido pelo Englobar, (2) fragment legado da curadoria, (3) ignorado manualmente pela lixeira.

**Why:** a primeira versao da lixeira listou todo `active=false` e apareceram 125 itens (englobados junto). Restaurar um englobado ressuscitaria duplicata; restaurar forcando `kind='blood'` corromperia fragments legados (Fail do architect).

**How to apply:** todo estado reversivel novo ganha selo proprio (ex.: `ignored_at` timestamp nullable): marcar preenche o selo sem tocar em outras colunas; reverter exige o selo (409 sem ele) e limpa so o selo. Nunca sobrecarregar um booleano ja polissemico.
