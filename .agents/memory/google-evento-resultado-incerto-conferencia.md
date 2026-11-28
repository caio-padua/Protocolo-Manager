---
name: Google Agenda — resultado incerto precisa de conferência com id reservado
description: Como reenviar visita ao Google depois de falha sem duplicar evento nem bloquear cancelar/remarcar
---
Sessão com envio ao Google incerto (campos googleSyncPending*) trava remarcar e
cancelar. A saída é a conferência: reaproveitar o identificador JÁ reservado
(evento existe -> update; não existe -> create com o MESMO id). Nunca gerar id
novo, nunca tratar erro do Google como "não existe" (só 404 é "não existe").

**Why:** sem caminho de conferência, uma queda de rede deixava a visita presa
para sempre; id novo duplicaria o compromisso na agenda da clínica.

**How to apply:** todo envio novo ao Google passa por lib/session-google-sync.ts
(reserva -> envio -> grava). Falha do Google nunca desfaz reserva do sistema. O
corpo do evento sai de buildEventRequestBody (sendUpdates none, sem attendees).
Teste com Google simulado; nenhum evento real em teste.
