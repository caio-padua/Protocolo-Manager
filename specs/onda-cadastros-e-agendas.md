# ONDA — Cadastros e Agendas (multi-spec / spec-mãe)

Data: 20/06/2026 — CEO Dr. Caio. Método: Paxter Loop (especificar -> construir -> revisar).

## Objetivo (uma frase)
Transformar o sistema no dono das clínicas (endereços), das equipes e das agendas do Google da conta `clinica.padua.agenda@gmail.com`, espelhando no Google tudo que o CEO fizer no sistema (criar, renomear, apagar), e enriquecer a entrega do evento ao cliente (arquivo "Adicionar à agenda" por e-mail, botões Ligar e WhatsApp da clínica).

## Mapa da onda (spec-mãe -> sub-specs)
Esta spec-mãe só agrega. Cada sub-spec é o alvo real, com requisitos próprios, casos extremos, definição de pronto e linhas vermelhas. Ordem por dependência (cada uma depende da anterior):

| Ordem | Sub-spec | Arquivo | Item do CEO | Depende de |
|---|---|---|---|---|
| 1 | Cadastro de Clínicas (endereços) | `onda-cadastros-e-agendas/SUB-01-clinicas.md` | 5.a, 5.b | — |
| 2 | Gestão de Agendas Google (espelho) | `onda-cadastros-e-agendas/SUB-02-agendas-google.md` | 3, 3.a, 3.b, 3.c, 4.d | SUB-01 |
| 3 | Menu Cadastros + Equipe + Vínculos | `onda-cadastros-e-agendas/SUB-03-menu-equipe-vinculos.md` | 4.a, 4.b, 4.c | SUB-01, SUB-02 |
| 4 | Convite por e-mail (.ics) + subwave | `onda-cadastros-e-agendas/SUB-04-convite-ics-email.md` | 1 | SUB-01 |
| 5 | Ligar + WhatsApp da clínica no evento | `onda-cadastros-e-agendas/SUB-05-ligar-whatsapp.md` | 2 | SUB-01 |

## Fatos verificados do código atual (linha de base)
1. Tabela `locations` (lib/db/src/schema/locations.ts) já tem: `name`, `address`, `type`, `googleCalendarId`, `color`, `active`. NÃO tem telefone nem endereço decomposto nem latitude/longitude.
2. Tabela de junção `location_professionals` (locationId, professionalId, role) já liga profissional a unidade.
3. Tabela `agenda_resources` (lib/db/src/schema/agenda-motor.ts) já tem `googleCalendarId` próprio por recurso (ex.: "Médico Local", "Enf. Local").
4. Tabela `professionals` tem `role` (texto livre, default "executor"), `name`, `crm`, `specialty`, `email`, `phone`, `unit`, `serviceTypes`, `active`. CRUD parcial (GET/POST; sem PUT/DELETE).
5. `lib/google-calendar.ts` hoje só mexe em EVENTOS (insert/update/patch/delete) e LISTA calendários (calendarList.list). NÃO cria/renomeia/apaga calendários nem mexe em ACL (compartilhamento).
6. Conta oficial: `clinica.padua.agenda@gmail.com` (constante `CLINIC_GOOGLE_ACCOUNT`).
7. Escopo OAuth concedido pela conexão (verificado em 20/06/2026 via tokeninfo): inclui `auth/calendar` (total), `calendar.calendars`, `calendar.acls`, `calendar.calendarlist`, `calendar.events`. Portanto criar/renomear/apagar/compartilhar calendários É VIÁVEL sem reconectar.

## Linhas vermelhas globais da onda
1. NUNCA apagar nem renomear o calendário `primary` da conta da clínica.
2. NUNCA apagar um calendário do Google que o sistema não criou/não gerencia (proteção contra perda das agendas históricas que o CEO já mantém manualmente).
3. Apagar agenda é destrutivo e irreversível (apaga TODOS os eventos dentro dela) — exige confirmação forte na UI (ver SUB-02).
4. NÃO alterar o motor da grade do RAS FAP nem `/api/budgets/calculate` (fora do escopo desta onda).
5. Manter o padrão de evento já aprovado (Pacote B): símbolos ✅/❌, bloco HORÁRIO, títulos em MAIÚSCULAS sem HTML, Convite A/B (sendUpdates:'none', sem attendee, atualizar o mesmo evento).

## Definição de PRONTO da onda inteira
1. As 5 sub-specs aprovadas pelo architect, uma a uma, sem pendência.
2. Dados fictícios criados e o fluxo testado de ponta a ponta (criar clínica fictícia -> criar agenda Google vinculada -> vincular profissional -> agendar -> evento cai na agenda certa -> e-mail com .ics -> botões Ligar/WhatsApp corretos).
3. Comunicação final ao CEO em Densidade B, com "RESUMO EM 1 LINHA".

## RESUMO EM 1 LINHA
Spec-mãe que orquestra 5 sub-specs para o sistema passar a comandar clínicas, equipes e agendas do Google da conta da clínica (espelho total), além de entregar o evento ao cliente com arquivo "Adicionar" e botões Ligar/WhatsApp.
