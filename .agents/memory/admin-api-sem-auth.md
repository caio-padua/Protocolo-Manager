---
name: API admin do Manager nao tem camada de auth
description: Por que os endpoints admin do api-server nao tem authz e quando NAO "consertar" isso.
---

# API admin (Padcon Conect / Manager) roda sem autenticacao

Todos os routers admin do `artifacts/api-server` (dashboard, clients, protocols,
anamnese-portal/fila, etc.) sao montados em `routes/index.ts` **sem nenhum
middleware de autenticacao/autorizacao**. So o portal do paciente (`client-portal`,
`anamnese-portal/submit`) usa token HMAC (lib `portal-token.ts`).

**Why:** e clinica unica (single-tenant, Dr. Caio), o app admin e acessado pela
equipe via o ambiente/proxy do Replit, nao exposto como SaaS multi-tenant. O modelo
de ameaca atual assume que a superficie admin nao e publicamente autenticada — isso
vale para TODOS os endpoints admin, nao so os novos.

**How to apply:** se uma revisao (architect) apontar "broken access control" em um
endpoint admin novo, NAO inventar um sistema de auth so para 1-2 rotas — seria
inconsistente com o resto e fora de escopo. Tratar como condicao arquitetural pre-
existente do app inteiro. Construir auth de verdade so quando o CEO pedir
explicitamente uma onda de autenticacao (afeta os ~25 routers + o front que usa raw
fetch sem credenciais).
