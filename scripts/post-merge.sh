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
