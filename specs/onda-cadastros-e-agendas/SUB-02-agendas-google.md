# SUB-02 — Gestão de Agendas Google (espelho)

Onda: Cadastros e Agendas. Itens do CEO: 3, 3.a, 3.b, 3.c, 4.d. Data: 20/06/2026.

## Objetivo (uma frase)
Dar ao CEO uma ferramenta no sistema para criar, renomear e apagar agendas (calendários) DENTRO da conta `clinica.padua.agenda@gmail.com`, espelhando cada ação no Google em tempo real, e listar/gerenciar as agendas que já existem hoje nela.

## Contexto técnico (verificado)
A conexão Google já concede escopo total (`auth/calendar`, `calendar.calendars`, `calendar.acls`, `calendar.calendarlist`). Hoje `lib/google-calendar.ts` só mexe em eventos e lista calendários — falta o CRUD de calendários e ACL.

## Requisitos exatos
1. Novas funções em `artifacts/api-server/src/lib/google-calendar.ts` (usando `googleapis`, mesma autenticação atual):
   1.1. `createCalendar(summary, opts?)` -> `calendars.insert` (cria agenda nova na conta da clínica). Retorna o `id` do calendário criado.
   1.2. `renameCalendar(calendarId, newSummary)` -> `calendars.patch` (renomeia/atualiza summary, timeZone, description).
   1.3. `deleteCalendar(calendarId)` -> `calendars.delete` (apaga a agenda inteira).
   1.4. (Opcional, para "editável/compartilhada") `shareCalendar(calendarId, email, role)` -> `acl.insert` (role "writer" torna editável para o e-mail).
2. Tabela nova `agenda_calendars` (lib/db) — o "registro nativo" das agendas geridas pelo sistema:
   2.1. Campos: `id` (serial), `googleCalendarId` (texto, único), `name` (texto), `kind` (texto: "geral" | "medico" | "enfermagem" | "outro"), `locationId` (FK locations, opcional), `managedBySystem` (boolean, default true), `color` (texto), `active` (boolean, default true), `createdAt`.
   2.2. `managedBySystem=true` marca as agendas que o sistema CRIOU e pode apagar/renomear. Agendas pré-existentes importadas ficam `managedBySystem=false` por padrão (protegidas contra apagar).
3. API REST `/api/agenda-calendars`:
   3.1. `GET` — lista do banco, cruzando com `calendarList` do Google para mostrar quais existem de fato (status sincronizado/órfão).
   3.2. `POST` — cria a agenda no Google (createCalendar) E grava a linha no banco (espelho). Item 3.b.
   3.3. `PUT /:id` — renomeia no Google (renameCalendar) E atualiza o banco. Item 3.a/3.b.
   3.4. `DELETE /:id` — apaga no Google (deleteCalendar) E remove do banco. Só permitido quando `managedBySystem=true` e o calendário NÃO é `primary`. Item 3.b ("até apagar").
   3.5. `POST /api/agenda-calendars/import` — importa para o banco as agendas que já existem hoje na conta (a partir do calendarList), marcando-as `managedBySystem=false` (editáveis no nome, protegidas contra apagar até o CEO liberar).
4. Espelho bidirecional mínimo (item 3.b — "espelho do que ocorre internamente"): a fonte da verdade é o SISTEMA. Toda ação no sistema (criar/renomear/apagar) reflete no Google na mesma chamada. Não é exigido webhook do Google -> sistema nesta sub-spec (fica deferido); o `GET` mostra divergências (órfão no Google / órfão no banco) para o CEO resolver.
5. Item 3.c (maiúsculas): o nome da agenda exibido e gravado segue MAIÚSCULAS quando o CEO assim digitar; o sistema não força minúsculas. (O padrão de evento já usa MAIÚSCULAS nos títulos de seção — mantido.)
6. Ferramenta fácil (item 4.d): tela React "Agendas Google" no grupo Cadastros com:
   6.1. Lista das agendas (nome, tipo, clínica vinculada, status, se é gerida pelo sistema).
   6.2. Botão "Nova agenda" (nome + tipo + clínica + cor).
   6.3. Renomear inline e Apagar por agenda.
   6.4. Apagar exige confirmação textual forte (digitar o nome da agenda) e só aparece para agendas `managedBySystem=true`.
   6.5. Botão "Importar agendas existentes" (chama o import do requisito 3.5).
7. Integração com o sync de evento: ao escolher o calendário de uma sessão (routes/google-calendar.ts), passar a considerar `agenda_calendars` vinculadas (por clínica/tipo) como fonte, mantendo a ordem de prioridade atual e o fallback "primary". Não quebrar o Pacote B (Convite A/B).

## Casos extremos
1. Apagar agenda com eventos dentro -> a UI avisa que TODOS os eventos serão perdidos; só prossegue com confirmação textual.
2. Tentar apagar/renomear `primary` -> bloquear (HTTP 409) com mensagem clara.
3. Tentar apagar agenda `managedBySystem=false` -> bloquear; oferecer "liberar gestão" como ação consciente separada.
4. Calendário existe no banco mas sumiu no Google (apagado manualmente) -> marcar "órfão" no GET, permitir limpar o registro.
5. Token expira no meio -> renovar via connector (mesma mecânica atual) e repetir.
6. Nome vazio ao criar/renomear -> 400.

## Definição de PRONTO
1. As 3 funções de calendário (create/rename/delete) testadas de verdade contra a conta da clínica usando UMA agenda fictícia "[TESTE] AGENDA AURORA": criar -> aparece no Google -> renomear -> muda no Google -> apagar -> some do Google. Provado por chamada real à API do Google (calendarList).
2. Tabela `agenda_calendars` criada (push) e espelho gravando.
3. Import das agendas existentes funciona e marca managedBySystem=false.
4. Bloqueios do primary e do não-gerido funcionam (409).
5. Tela Agendas Google cria/renomeia/apaga/importa.
6. Sync de evento continua caindo na agenda certa (Pacote B intacto).
7. Aprovação do architect contra esta sub-spec.

## Linhas vermelhas
1. NUNCA apagar/renomear `primary`.
2. NUNCA apagar calendário `managedBySystem=false` sem ação consciente separada do CEO.
3. Não quebrar o Convite A/B do evento (Pacote B) nem o padrão de descrição.
4. Apagar agenda sempre atrás de confirmação textual forte.

## RESUMO EM 1 LINHA
Ferramenta no sistema que cria, renomeia e apaga agendas na conta da clínica espelhando no Google na hora, importa as agendas existentes (protegidas), com trava no primary e confirmação forte para apagar.
