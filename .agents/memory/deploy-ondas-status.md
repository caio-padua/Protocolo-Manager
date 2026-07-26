---
name: Deploy 4 Ondas — status e decisões
description: Status das 4 ondas de deploy/go-live e decisões-chave para Railway.
---

# Deploy 4 Ondas PADAXOR — Status e Decisões

## Onda 1 — Segurança (COMPLETA)
- basicAuth.ts: dev=bypass (warn), prod=fail-closed; timingSafeEqual; 15 prefixos de bypass
- securityConfig.ts: CORS lista branca, Helmet, rate-limit 200/min
- app.ts: ordem CORS→Helmet→body→basicAuth→rateLimit→tenant→routes
- IS_CLONE: if IS_CLONE=true, /api/agentes/* e /api/agentes-chat/* retornam 503

## Onda 2 — Paridade de Infraestrutura (COMPLETA)
- objectStorageS3.ts: dual-flag Replit sidecar vs S3 real
- googleAuth.ts: dual-flag Replit Connectors vs Service Account JSON base64
- api-worker: pacote separado com 4 jobs (farmácia 22h, lembrete min, receituário 6h, drive 5min)
- cron e Drive Watcher REMOVIDOS do api-server (index.ts e app.ts)
- .env.railway.example: atualizado com todas as vars (ADMIN_*, ALLOWED_ORIGINS, S3_*, Google SA)
- docs/GUIA_GOOGLE_SERVICE_ACCOUNT.md: guia passo-a-passo

## Onda 3 — Medição e Prova de Valor (COMPLETA)
- SQL: ADD COLUMN empresa_id/custo_unitario/chave_idempotencia em 3 tabelas; consumo_eventos criado
- lib/consumo.ts: registrarConsumo (idempotente), somarConsumo, listarConsumo
- routes/prova-de-valor.ts: GET KPIs + POST PDF
- pages/prova-de-valor.tsx: tela no padcom
- Layout.tsx: item "Prova de Valor" em Estrutura & Governança

## Onda 4 — Licenciamento (COMPLETA)
- moduleGuard aplicado em 15 arquivos de rota (router.use ao nível do router)
- lib/menuItems.ts: lista mestre de 27 itens com moduloRequerido
- routes/menu.ts: GET /api/menu — filtra por módulos ativos do tenant
- Layout.tsx: useEffect busca /api/menu → filtrarNavegacao por grupo→módulo

## Regras fixas para Railway
- api-worker: numReplicas=1 NUNCA alterar (jobs duplicados)
- ADMIN_USERNAME + ADMIN_PASSWORD OBRIGATÓRIOS em NODE_ENV=production
- GOOGLE_SERVICE_ACCOUNT_JSON = base64 do JSON da Service Account
- IS_CLONE=true bloqueia /api/agentes/* e /api/agentes-chat/*

**Why:** Decisões de arquitetura para deploy Railway sem perda de funcionalidade dev.
**How to apply:** Consultar ao configurar um novo ambiente Railway ou ao depurar boot do api-server.
