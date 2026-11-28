---
name: Teste de servidor completo
description: Como subir src/app.ts real em banco descartável
---
Helper src/tests/helpers/servidor-completo.ts: remove credenciais de canais, push do drizzle, cria locations_semantic_code_seq e clients.sexo_biologico (fora do drizzle). Mockar sheets-dicionario e seed-avatares. Seed precisa empresa 5 ativa e empresa_id nos profissionais/clientes.
**Why:** sem isso o push falha, o login dá 403 e áreas do paciente dão 503.
**How to apply:** vitest --maxWorkers=1; harness de navegador com HARNESS_COMPLETO=1 em run_in_background; use 127.0.0.1; não usar pkill amplo (derruba o shell).
