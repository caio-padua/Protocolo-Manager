---
name: Confirmação do cliente por visita — lições de construção
description: Decisões e armadilhas da chave por visita, link de um clique e desafio presencial (Linha do Tempo Viva)
---

A confirmação do cliente por visita (chave de 6 dígitos, "Cliente confirma depois", desafio por dados do cadastro) usa tabelas novas por SQL bruto e nunca bloqueia o registro da aplicação.

**Why:** o drizzle push já propôs DROP destrutivo por drift; a regra do CEO é que a falta da chave nunca bloqueia a enfermeira; a confirmação só faz sentido depois de existir aplicação registrada (revisão independente reprovou sem isso).

**How to apply:**
- Jobs agendados do Manager vivem em `artifacts/api-worker/src/worker.ts`; `api-server/src/lib/cron.ts` NÃO é chamado por ninguém (código morto). Job novo em cron.ts nunca roda.
- `router.use(moduleGuard(...))` dentro de outro router não protege rota montada depois; declarar o guard no próprio router.
- Falha de `ensure*` de recurso opcional não pode dar `process.exit` no boot da API.
- Union TS `{status:"a"|"b"}` não estreita por discriminante; separar em um membro por literal.
- Teste de `dispatchDue` sem `onlyId` varre linhas de outros testes e infla contagens; sempre usar `onlyId`.
- Chave em log: `sendWhatsapp` aceita `corpoParaLog`; o provedor ainda guarda a mensagem inteira.
