---
name: Marcação na agenda gera o evento Google completo
description: Por que o evento criado pelo "Marcar" da Agenda Configuração saía "magro" e como foi unificado ao motor do protocolo.
---
O motor rico de descrição (buildDescriptionBody) sempre existiu, mas a marcação avulsa (bookSession/rescheduleSession) montava o evento por conta própria, com substâncias vazias, procedimento presumido (consulta/IV) e sem endereço.

**Regra:** toda marcação/remarcação com Google passa por `syncBookedSession` (session-google-sync), depois da transação e com reserva durável; nunca montar evento dentro de agenda-booking.

**Why:** o CEO quer ver no clique do Google a mesma ficha do protocolo (n/total, substâncias constantes, legenda, endereço); e memória antiga proíbe presumir via/procedimento.

**How to apply:** endereço vem da forma da agenda (Sede=local, Externo=endereço da agenda, Home Care=endereço do paciente — sem ele não envia, Online=nenhum). Visita sem aplicações usa o mesmo construtor em refreshSessionEventInPlace. Falha do Google nunca desfaz a marcação.
Falhas pré-existentes conhecidas (não são desta mudança): teste "não chama o Google ao remarcar" (verify chamado no preparo) e concierge-admin-routes (403).
