#!/bin/bash
# =============================================================================
# POST-MERGE SETUP — roda automaticamente após cada merge de task agent.
# =============================================================================
#
# ONDE COLOCAR UMA MIGRAÇÃO DE BANCO:
#   No FIM de scripts/migrations.sql, sempre com IF NOT EXISTS.
#   NÃO escreva ALTER TABLE aqui dentro.
#
# POR QUE NÃO USAR `node -e "require('pg')"` NESTE SCRIPT:
#   `pg` é dependência de lib/db, não da raiz. O pnpm isola node_modules por
#   pacote, então require('pg') a partir da raiz do monorepo falha com
#   MODULE_NOT_FOUND. Este script usa psql, que não depende de node_modules.
#
# REGRA DE OURO: nunca rodar `drizzle-kit push` / `db push` aqui.
#   Esse comando pode dar DROP em colunas com dados reais.
#
set -e

pnpm install --frozen-lockfile

if [ -z "$DATABASE_URL" ]; then
  echo "[post-merge] ERRO: DATABASE_URL não definida — migrações não aplicadas." >&2
  echo "[post-merge] Abortando de propósito: seguir em frente deixaria o banco" >&2
  echo "[post-merge] atrasado em relação ao código mesclado, e a falha apareceria" >&2
  echo "[post-merge] depois, como bug em produção." >&2
  exit 1
fi

echo "[post-merge] aplicando scripts/migrations.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f scripts/migrations.sql
echo "[post-merge] migrações aplicadas com sucesso"
echo "[post-merge] recuperando vínculos inequívocos de prescrições"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f scripts/backfill-prescription-clients.sql
