# Spec — Vínculo da Agenda interna com os calendários do Google (por recurso)

## Objetivo
Cada recurso da agenda interna (Enfermeira Local, Enfermeira Domiciliar, Médico
Local, Médico Online) deve enviar seus eventos para o calendário correto da conta
Google da clínica, em vez de cair todo na AGENDA GERAL (calendário primário).

## Estado atual (verificado)
- Conta Google conectada = `clinica.padua.agenda@gmail.com` (AGENDA GERAL, primário). CORRETA.
- Calendários disponíveis incluem: AGENDA ENFERMAGEM - LOCAL, AGENDA ENFERMAGEM -
  REMOTO, AGENDA MEDICO - CAIO PADUA - LOCAL, AGENDA MEDICO - CAIO PADUA - REMOTO.
- `agenda_resources` NÃO tem campo de calendário; o booking cria evento sem
  `calendarId` => vai para `primary` (AGENDA GERAL).
- O sync de protocolo (sync-session/sync-week) roteia por `location.googleCalendarId`.

## Mapeamento recurso -> calendário (coerente com as locations já cadastradas pelo CEO)
| Recurso (id) | Calendário Google |
|---|---|
| Enfermeira Local (2)      | AGENDA ENFERMAGEM - LOCAL (725448b0...) |
| Enfermeira Domiciliar (1) | AGENDA ENFERMAGEM - REMOTO (65fbeb90...) |
| Médico Local (3)          | AGENDA MEDICO - CAIO PADUA - LOCAL (146251b9...) |
| Médico Online (4)         | AGENDA MEDICO - CAIO PADUA - REMOTO (5b85fa12...) |

## Mudanças
1. Schema: coluna `google_calendar_id text` (nullable) em `agenda_resources`.
2. Seed: preencher os 4 recursos conforme a tabela acima.
3. `agenda-booking.ts` (bookSession): passar `calendarId = resource.googleCalendarId`
   ao `createCalendarEvent` e salvar `googleCalendarId` na sessão.
4. `routes/google-calendar.ts` (sync-session/sync-week): preferir o
   `googleCalendarId` do recurso da sessão (via `session.resourceId`); manter o
   fallback por location quando o recurso não tiver calendário.

## Linhas vermelhas
- NÃO alterar o motor de slots (computeResourceSlots) nem a regra de ocupação.
- NÃO mudar a verificação de conta (verifyClinicAccount) — só o calendário de destino.
- Fallback seguro: se o recurso não tiver calendário, usar o comportamento atual.

## Pronto quando
- Marcar/sincronizar uma sessão de Enfermeira Local cria o evento na AGENDA
  ENFERMAGEM - LOCAL (calendarId 725448b0...), confirmado por curl.
- As 4 sessões do protocolo 19 aparecem na AGENDA ENFERMAGEM - LOCAL.
