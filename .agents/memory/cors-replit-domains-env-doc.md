---
name: CORS auto REPLIT_DOMAINS + env doc por artefato
description: Como configurar CORS corretamente usando REPLIT_DOMAINS, e por que cada artefato precisa de .env.railway.example próprio.
---

## A regra

CORS do api-server deve construir a allowlist como: união deduplicada de `ALLOWED_ORIGINS` (manual) + `REPLIT_DOMAINS` (injetada pela plataforma). Nunca usar wildcard genérico para `*.replit.dev` com `credentials: true` — isso anula a allowlist configurada.

**Why:** wildcard genérico com credentials permite qualquer repl Replit enviar cookies/tokens autenticados ao servidor — violação CORS séria.

**How to apply:** `buildAllowedOrigins()` em `securityConfig.ts` lê ambas, mapeia REPLIT_DOMAINS para URLs com `https://`, faz `Array.from(new Set([...]))`.

## Documentação por artefato

O architect exige que a variável `ALLOWED_ORIGINS` esteja documentada em `artifacts/api-server/.env.railway.example` (arquivo próprio do artefato), não só no `.env.railway.example` da raiz. A raiz pode existir como referência do projeto, mas o artefato precisa de seu próprio arquivo de exemplo.

**Why:** no Railway cada serviço tem seu próprio painel de variáveis; o operador consulta o `.env.railway.example` do serviço, não o da raiz.

## Comentário correto para ALLOWED_ORIGINS

```
# Em dev Replit: REPLIT_DOMAINS é lida automaticamente — não precisa definir aqui.
# Em produção com domínio próprio: definir com o domínio real do frontend.
ALLOWED_ORIGINS=https://app.clinica.com.br,https://www.clinica.com.br
```
