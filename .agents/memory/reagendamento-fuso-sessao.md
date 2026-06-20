---
name: Reagendamento e fuso da sessao (area do cliente)
description: scheduled_date/scheduled_time da sessao sao "hora de parede" BRT em texto; comparar com now() exige ancorar -03:00.
---

# Reagendamento da cliente (Onda 2) — armadilhas duraveis

## Fuso ao comparar antecedencia (regra das 24h)
`sessions.scheduled_date` (texto AAAA-MM-DD) e `sessions.scheduled_time` (texto HH:mm) sao
HORA DE PAREDE da clinica (BRT = UTC menos 3), nao UTC.

**Regra:** ao comparar com `new Date()` (instante absoluto), ancore explicitamente o horario da
sessao com sufixo `-03:00` (ex.: `new Date(`${date}T${time}:00-03:00`)`). Sem isso, num servidor
em UTC a diferenca sai 3 horas errada e a borda de 24h aceita/recusa remarcacao incorretamente.

**Por que:** servidor de producao roda em UTC; `new Date('2026-06-23T08:30:00')` vira 08:30 UTC,
nao 08:30 BRT. Brasil nao tem horario de verao desde 2019, entao o offset fixo -03:00 e seguro.

## Comparacao de janela e fim de protocolo
Datas AAAA-MM-DD comparam-se com seguranca como STRING (ordem lexicografica == cronologica).
`protocols.end_date` e texto e pode vir nulo ou em outro formato: so bloquear quando casar
`^\d{4}-\d{2}-\d{2}` e comparar `date > end_date.slice(0,10)`.

## Anti-IDOR no portal
Endpoints da area do cliente NAO passam por OpenAPI/Orval — o front chama via `fetch` com
`Authorization: Bearer <token do portal>`. A posse e dupla: a rota deriva `clientId` do token e
o helper revalida `session.clientId === clientId`, sempre com mensagem generica ("nao encontrada")
para nao revelar existencia/dono da sessao.

## Mover evento no Google = delete + create
Nao existe "update" no helper de calendario: mover = `deleteCalendarEvent` antigo + `createCalendarEvent`
novo. Em falha parcial (apagou o antigo, falhou o novo), zere `google_event_id`/`google_calendar_id`
em vez de manter o id antigo, senao fica ponteiro orfao para sincronizacoes futuras. Google e e-mail
sao best-effort: nunca travam nem revertem a remarcacao (a fonte da verdade e o banco).
