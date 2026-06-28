---
name: API admin do Manager — auth parcial por rota sensivel
description: Quais escritas admin exigem token de colaborador, quais seguem abertas, e como decidir ao adicionar rota nova.
---

# API admin (Padcon Conect / Manager) — camada de auth PARCIAL

A maioria dos routers admin do `artifacts/api-server` (dashboard, clients, protocols,
substances, anamnese-portal/fila, etc.) e montada **sem** middleware de auth. Mas o app
TEM um sistema de colaborador (token HMAC) aplicado seletivamente:

- A area admin do padcom fica atras do `CollaboratorGate` (o operador faz login; o token
  fica no localStorage e e injetado nas chamadas).
- `collaboratorGuard` (em `routes/collaborator.ts`) protege ESCRITAS so nos prefixos
  `/site-content` e `/cadastros` (e audita). GET passa sempre livre.
- Rotas pontuais usam `requireCollaborator` direto (credentials, audit, leitura de PII de
  anamnese, e agora o toggle de gateway de comunicacao).

**Why:** e clinica unica (single-tenant, Dr. Caio), mas escritas operacionais/sensiveis
vem sendo protegidas por rota conforme aparecem. A nota antiga ("nenhum endpoint admin tem
auth, nao consertar") era ampla demais e fazia eu descartar achados corretos do architect.

**How to apply:** ao criar uma ESCRITA admin nova que muda configuracao operacional ou
toca dado sensivel, proteja a rota com `requireCollaborator` E faca o front enviar
`Authorization: Bearer <getCollabToken()>` (o token ja existe porque a area e logada). GET
de status/leitura segue livre. NAO refatorar em massa as ~25 rotas abertas legadas (clients
etc.) — isso so quando o CEO pedir uma onda de auth; mas tambem nao usar "o app inteiro e
aberto" como desculpa para deixar uma escrita sensivel NOVA publica.
