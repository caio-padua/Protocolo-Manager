---
name: Padrao do evento Google Agenda (Pawards MedCore)
description: Como o evento do Google Calendar e montado a partir da ida/sessao; regra do checklist de procedimentos e da duracao.
---

# Padrao do evento Google Agenda

O evento do Google (lib/google-calendar.ts: buildEventTitle/buildDescriptionBody) segue o
layout "Pawards MedCore" dos prints do CEO: titulo "NOME CPF xxx [SESS]"; corpo com
"Developed by: Pawards MedCore", nome, CPF, "Agendamento Número: N/Total", Unidade,
checklist fixo de 6 procedimentos (👍/👎 + [Nmin]), "Duração Total", Status (quadrado+texto),
"Substâncias Protocolo" (🟩/🟨/🟦/⬜ + [n/total] + [ESTADO]) e Legenda. Acentos PRESERVADOS.

## Regra critica: activeProcedureTypes = só executavel na ida
**Regra:** o campo `activeProcedureTypes` (que pinta o 👍 e calcula a Duração Total via
`computeActiveDuration`) deve ser montado SO com os tipos de procedimento DISP/aplicados
daquela ida — nunca incluir substancia PROX.

**Why:** numa semana de tipo misto (ex.: DISP im + PROX iv), incluir PROX marcava 👍 num
procedimento que nao seria executado e inflava a Duração Total / a duracao real do evento
(endDate), divergindo do print. A duracao exibida e a do evento usam a mesma funcao, entao
o erro aparecia nos dois.

**How to apply:** nos dois handlers de sync (routes/google-calendar.ts: sync-session e
sync-week) passar `Array.from(dispProcTypes)` (o Set que ja acumula DISP + fallback
"consultation"), nunca o Set "todos" (activeProcTypes). Substancia aplicada (appliedAt)
continua contando porque mantem availability "disp".

## Verificacao real (sem rota propria)
Para conferir titulo/descricao reais no Google use code_execution:
`listConnections('google-calendar')[0].settings.access_token` + fetch
`GET https://www.googleapis.com/calendar/v3/calendars/{calId}/events/{eventId}`.
O google_event_id e o google_calendar_id ficam salvos na tabela sessions apos o sync.

## Gap conhecido (autoagendamento)
bookSession (agenda-booking.ts) cria evento com `substances:[]` e 1 tipo ativo -> evento
"pobre" (sem lista de substancias). O fluxo rico e protocolo -> validate -> sync. Se for
preciso evento rico no autoagendamento, hidratar substances/activeProcedureTypes ali.
