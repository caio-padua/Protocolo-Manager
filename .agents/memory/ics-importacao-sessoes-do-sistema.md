---
name: Importar .ics nao pode reimportar sessoes do proprio sistema
description: Eventos que o sistema criou no Google voltam no .ics e devem ser reconhecidos, nao importados como compromisso externo
---
Todo evento que o sistema empurra ao Google tem UID `<id>@google.com` e o id fica em `sessions.google_event_id`. Importar um .ics sem esse filtro duplica sessoes de clientes como se fossem compromissos externos.

**Why:** nos .ics reais da clinica, ~60 de ~3.500 eventos eram sessoes do sistema; contar tudo como novo inflaria a agenda e quebraria a regra "um evento, sem duplicar".

**How to apply:** previa e confirmacao usam `idsDeSessoesDoSistema` (locations-agenda-google.ts); qualquer novo importador (ou a leitura Google->sistema da Fase 2) precisa do mesmo filtro. Agenda Google so pode ser vinculada a 1 local por empresa (indice unico por empresa); 4 locais legados da Paluzze ainda apontam para agendas do Padua.
