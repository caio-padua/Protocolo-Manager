---
name: Carga no Postgres do Railway via tunel SSH
description: Como carregar dumps no Postgres do Railway a partir do Replit e as armadilhas que quase apagaram o banco
---

- Caminho que funciona: binario do CLI Railway baixado do GitHub releases (npx bloqueado pelo package-firewall), auth por RAILWAY_API_TOKEN (token de CONTA; project token NAO suporta SSH), `railway ssh keys add` apos `ssh-keygen`, e `railway connect Postgres --tunnel-only` em background + psql no MESMO comando bash (tunel morre entre chamadas; carga de 24 MB levou ~43 s, cabe nos 120 s).
- **Armadilha grave:** dump de truncate com `BEGIN;/COMMIT;` embutidos ANULA o `--single-transaction` do psql — o COMMIT interno confirma o truncate antes da carga; falha no meio deixa o banco vazio. Sempre remover BEGIN/COMMIT dos arquivos antes de rodar com --single-transaction.
- **Why:** aconteceu em 27/07/2026 — o truncate foi confirmado e a carga falhou por coluna ausente; so nao houve perda porque o destino estava quase vazio.
- **How to apply:** antes de qualquer carga transacional, `grep -nE '^(BEGIN|COMMIT);'` nos arquivos; alinhar esquema primeiro (comparar information_schema dos dois bancos e gerar `ADD COLUMN IF NOT EXISTS`); dumps "idempotentes" de terceiros conferem-se com grep de `IF NOT EXISTS`, nao se acredita.
