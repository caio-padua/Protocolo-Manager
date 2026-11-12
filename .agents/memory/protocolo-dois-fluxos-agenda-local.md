---
name: Protocolo — dois fluxos de agendamento e local sobrecarregado
description: Fluxo por períodos (enfermagem Sede) x fluxo por procedimento (equipe); location_id do procedimento aponta para registro de agenda
---
Existem DOIS caminhos de agendar protocolo: por períodos (substâncias, só enfermagem Sede, recusa substância com médico, exige agenda no cadastro do cliente e INNER JOIN em locations) e por procedimento (equipe 1 a 3, categoria gravada na agenda, LEFT JOIN, reserva conjunta).
**Why:** diagnóstico de 11/11/2026 mostrou que procedimento_equipes.location_id (NOT NULL) aponta para registros de agenda Google (ex.: "AGENDA ENFERMAGEM - LOCAL"), não para endereço físico; o filtro de local do fluxo por procedimento vira filtro de agenda.
**How to apply:** antes de mexer em local/agenda/equipe de procedimento, ler este ponto; agenda nova sem registro em locations é invisível ao fluxo por períodos. Aguardando decisão do CEO sobre o arquivo de referência permanente.
