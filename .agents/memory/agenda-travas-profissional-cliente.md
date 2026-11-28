---
name: Travas de agenda por profissional e cliente
description: Por que a trava por clinica nao basta, ordem unica de travas e regras de conflito de intervalo
---
A trava de agenda existente (`pg_advisory_xact_lock(19872026, empresaId)`) e POR CLINICA, nao por recurso. Ela ja serializa tudo da mesma clinica (inclusive o mesmo paciente em duas agendas, pois paciente pertence a uma clinica). A brecha real era o MESMO PROFISSIONAL em duas clinicas.

Ordem obrigatoria de travas em toda transacao que grava sessao: clinica (19872026) -> profissionais em id crescente (19872031) -> cliente (19872032). Implementada em `lib/agenda-conflitos.ts` (`travarParticipantes`), chamada por bookSession, rescheduleSession e reservarOcorrenciaTx (Pit Stop).

**Why:** a consulta de conflito isolada le "livre" nas duas transacoes; so a trava faz a segunda ler depois do COMMIT da primeira. Teste com atraso injetado apos a leitura prova isso (sem as travas novas, falha a corrida entre clinicas).

**How to apply:** profissional so conta ocupado por agenda VINCULADA (`agenda_resources.professional_id`), nunca por `sessions.professional_id` (visita de enfermagem guarda o prescritor). Sessoes irmas da mesma ocorrencia de equipe conjunta (`protocolo_ocorrencia_participantes`) nao conflitam entre si. Mensagem de conflito sempre generica, sem dados de terceiros. A grade de horarios (motor) ainda nao enxerga profissional de outra clinica: pode mostrar livre e a gravacao recusar.
