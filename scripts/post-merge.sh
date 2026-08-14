#!/bin/bash
# Post-merge setup — executa após cada merge de task agent.
#
# REGRA DE OURO: nunca rodar drizzle-kit push / db push aqui.
# Esse comando pode DROP colunas com dados (é interativo e destrói dados).
# Migrações de schema são feitas MANUALMENTE via ALTER TABLE no banco.
#
# Este script faz APENAS instalação de dependências — seguro e idempotente.
set -e

pnpm install --frozen-lockfile

# ── Schema migrations (ALTER TABLE — never drizzle-kit push) ──────────────────
# Task #92: coluna de canal de entrega no log de mensagens.
node -e "
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });
p.query(\"ALTER TABLE whatsapp_mensagens_log ADD COLUMN IF NOT EXISTS via TEXT NOT NULL DEFAULT 'whatsapp'\")
  .then(() => { console.log('[migration] via column ok'); p.end(); })
  .catch(e => { console.error('[migration] via column:', e.message); p.end(); process.exit(1); });
"
