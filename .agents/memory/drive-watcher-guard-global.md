---
name: drive-watcher guard global — ordem de rotas
description: drive-watcher.ts tem router.use(requireCollaborator) sem prefixo de caminho; bloqueia TODAS as rotas registradas depois dele no index.ts.
---

## Regra

`artifacts/api-server/src/routes/drive-watcher.ts` tem na linha 21:

```typescript
router.use(requireCollaborator);
```

Sem prefixo de caminho → intercepta TODAS as requisições que passam por ele, incluindo GETs para rotas que não existem no driveWatcherRouter.

**Por quê:** Express sub-routers sem prefixo veem todas as requisições. Um `router.use(middleware)` global dentro do sub-router roda para qualquer URL que chegue nele — mesmo que nenhuma rota do sub-router bata com o path.

**Como aplicar:** Ao registrar uma nova rota clínica em `routes/index.ts`, coloque o `router.use(novoRouter)` **antes** de `router.use(driveWatcherRouter)` (linha 223). Rotas registradas depois do driveWatcherRouter são bloqueadas com 401.

Já afetou: radarClinicoRouter (criado depois; corrigido movendo para antes do driveWatcherRouter).
