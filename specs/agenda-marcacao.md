# Spec — Agenda: Marcacao Real (F2.3) + Autoagendamento do Paciente (F4) + Sincronizacao Google

Status: em construcao | Autor: Dr. Replit Paxter | Data: 20/06/2026 | Metodo: Paxter Loop
Decisao do CEO: "quero A e B juntas" (F2.3 marcacao pela recepcao + F4 paciente marca sozinho), simular agendamentos da paciente-modelo Carlucia, layout premium (skill-layout-paxter), vincular com a agenda Google clinica.padua.agenda@gmail.com.

## Objetivo (uma frase)

Fechar o ciclo da agenda: ligar a sessao a um recurso agendavel, deixar a recepcao marcar um cliente num horario aberto e o proprio paciente se autoagendar pela Area do Paciente, refletindo a marcacao no Google Calendar da clinica.

## Escopo

DENTRO (esta spec):
- F2.3 — Marcacao real: coluna `resource_id` na sessao; ocupacao do motor passa a vir das sessoes marcadas (recurso+data); endpoint de marcacao; tela de marcacao da recepcao (premium).
- F4 — Autoagendamento: o paciente, logado na Area do Paciente, escolhe recurso/data/horario aberto e marca; layout premium.
- Sincronizacao Google (IDA, real): ao marcar, criar evento no Google Calendar da clinica; ao cancelar, remover. Eventos de simulacao etiquetados e reversiveis.
- Simulacao: marcar agendamentos ficticios no nome da Carlucia (cliente id 11, protocolo 12 "REPOSICAO HORMONAL"), ligando recurso, e-mail e telefone ja existentes.

FORA (proxima onda, registrado com honestidade):
- 2 VIAS COMPLETA (Google -> sistema): refletir no sistema uma edicao feita direto no Google. Exige Google Calendar push notifications (watch channel) + endpoint webhook publico estavel + renovacao de canal + reconciliacao. Frágil em ambiente de desenvolvimento (URL publica muda). Entregamos a IDA real (sistema -> Google) e o espelho de status; a VOLTA fica para a onda seguinte. NAO sera anunciada como pronta.
- Termo juridico de autoagendamento e politica de no-show/cancelamento.
- Login/governanca por papel (F3).

## Vocabulario

| Termo | Significado |
|---|---|
| Marcacao | Ato de ligar uma sessao a um recurso + data + horario aberto |
| Slot aberto | Horario liberado pelo motor anti-ilha (computeAgendaSlots) |
| Ocupacao real | Conjunto de horarios ja marcados naquele recurso+data (status agendado/realizado) |
| Autoagendamento | O proprio paciente marca, pela Area do Paciente, sem a recepcao |
| Sincronizacao IDA | Sistema cria/atualiza/remove o evento no Google Calendar |

## Modelo de dados

1. `sessions` ganha `resource_id integer` (NULL permitido; sessoes antigas seguem sem recurso). Vinculo informativo a `agenda_resources.id`. Sem alterar colunas existentes.

## Motor de ocupacao real (F2.3)

- `GET /api/agenda/slots?resourceId=&date=` passa a derivar a ocupacao das sessoes: horarios de `sessions` com `resource_id = resourceId` e `scheduled_date = date` e `status IN ('scheduled','completed')`.
- Mantem o parametro opcional `occupied` (CSV HH:mm) como OVERRIDE para a Prova Viva (quando vier, ele manda; quando nao vier, usa a ocupacao real). NAO alterar a logica de `computeAgendaSlots` (linha vermelha).

## Endpoints (sob /api, contrato OpenAPI + Orval)

1. `POST /api/agenda/book` (recepcao): body { resourceId, clientId, protocolId, date (YYYY-MM-DD), time (HH:mm), serviceType?, unit?, syncGoogle? }.
   - Valida via motor que `time` esta com state "aberto" naquele recurso+data; se nao, 409 com motivo.
   - Cria a sessao (status "scheduled") ligada a recurso+cliente+protocolo+data+hora.
   - Se syncGoogle, cria o evento no Google e grava googleEventId/googleCalendarId.
2. `POST /api/area-paciente/agendar` (paciente): body { token, resourceId, date, time }.
   - Resolve o clientId pelo token da Area (CPF+nascimento, HMAC). Usa o protocolo ativo do cliente. Mesma validacao do motor. Cria a sessao. Sincroniza Google (etiqueta + e-mail do cliente como convidado).
   - Erros genericos (nao vazar existencia de cliente).
3. `DELETE /api/agenda/book/:sessionId` (cancelar marcacao): remove o evento Google (se houver) e marca a sessao como "cancelled" (nao apaga historico).
4. `POST /api/agenda/limpar-simulacao` (reversibilidade): remove as sessoes/eventos de simulacao etiquetados (so os criados pela demo da Carlucia), para nao poluir a agenda real.

## Telas (premium — skill-layout-paxter)

1. Recepcao (F2.3) — painel "MARCAR CLIENTE" na pagina Motor de Agenda (`/agenda/motor`):
   - Escolher recurso + data -> regua de slots (reusa Prova Viva) -> clicar num slot aberto -> escolher cliente (busca) + protocolo -> "CONFIRMAR MARCACAO".
   - Apos marcar, o slot fica "ocupado" na regua (ocupacao real).
2. Paciente (F4) — Area do Paciente (`/area`), aba AGENDA:
   - Botao "AGENDAR ATENDIMENTO" -> escolher recurso/servico + data -> regua de horarios abertos -> confirmar -> tela de sucesso.
   - Vinculo automatico: protocolo ativo da cliente, e-mail e telefone ja cadastrados.

## Google Calendar — alvo e seguranca

- Conta conectada via integracao Replit (connector google-calendar). ANTES de empurrar qualquer evento, confirmar por `listCalendars()` qual e a conta/agenda; se nao for clinica.padua.agenda@gmail.com, avisar o CEO e nao empurrar.
- Calendario alvo: o da clinica (id confirmado por listCalendars; default 'primary' se for a conta da clinica).
- Eventos de SIMULACAO levam prefixo "[SIMULACAO]" no titulo e sao removiveis por `POST /api/agenda/limpar-simulacao`.

## Casos extremos

| Caso | Tratamento |
|---|---|
| Slot escolhido nao esta "aberto" (encheu/antecedencia/cadeia) | 409, regua recarrega |
| Dois pedidos no mesmo slot (corrida) | Reconsultar ocupacao antes de inserir; se ocupado, 409 |
| Cliente sem protocolo ativo (autoagendamento) | Mensagem clara; sem protocolo nao marca |
| Google nao conectado / conta errada | Marcar mesmo assim no sistema; avisar que a sincronizacao falhou; nao quebrar |
| Cancelamento de sessao sem evento Google | So muda status; nao tenta apagar no Google |
| Agenda real nao deve ser poluida | Eventos de simulacao etiquetados + rota de limpeza |

## Definicao de PRONTO

| Criterio | Como conferir |
|---|---|
| `resource_id` no banco | push roda; SELECT funciona |
| Ocupacao real no motor | marcar via curl -> GET slots mostra o horario "ocupado" |
| Marcacao da recepcao | curl POST /agenda/book em slot aberto cria sessao; em slot bloqueado da 409 |
| Autoagendamento | curl POST /area-paciente/agendar (token Carlucia) cria sessao; screenshot da tela do paciente |
| Google IDA | evento aparece no Google da clinica (confirmado por listCalendars/list); etiqueta [SIMULACAO]; rota de limpeza remove |
| 2 vias (volta) | NAO entregue nesta onda; comunicado com honestidade |
| Telas premium | screenshot desktop + mobile, design 3D Paxter |
| Revisao architect | requisito por requisito, zero pendencia |

## Linhas vermelhas

- Nao alterar a logica de `computeAgendaSlots` (so alimentar a ocupacao real).
- Nao tocar /api/budgets/calculate nem o motor de desmembramento.
- Nao truncar nenhuma tabela populada (clients, sessions, protocols).
- Nao poluir a agenda Google real de forma irreversivel (etiqueta + rota de limpeza).
- Nao anunciar 2 vias completa como pronta (so a IDA + espelho de status).
- Manter o relevo 3D Paxter; nao inventar estilo.

## Decisoes que tomei (defaults; CEO mandou agir com sabedoria)

| Decisao | Valor adotado | Reversivel? |
|---|---|---|
| `resource_id` nullable em sessions | nao quebra sessoes antigas | sim |
| Ocupacao real + override `occupied` | real por padrao; override so na Prova Viva | sim |
| Autoagendamento usa protocolo ativo do cliente | sessao nova ligada ao protocolo | sim |
| Google: IDA real agora; VOLTA (2 vias) faseada | honestidade explicita ao CEO | sim |
| Eventos de simulacao etiquetados + rota de limpeza | nao polui agenda real | sim |
