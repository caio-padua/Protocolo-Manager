---
name: Campo ligado + legenda de origem + horário padrão do Motor
description: Dados não digitados aparecem como título Saliente + resposta Côncava + chip letra/número da origem; horário padrão vem de agenda_windows
---
- Dado vindo de cadastro/motor usa `CampoLigado` (Padrão 33 da skill-layout-paxter); códigos C/M/E em `LEGENDAS_ORIGEM`.
- "Local de atendimento" não é campo próprio: a agenda comporta o local.
- Horário padrão = início do expediente em `agenda_windows` (início mais cedo por dia; vence o mais repetido; empate = mais cedo). Sem janelas = aviso, nunca valor inventado.
**Why:** CEO pediu rastreabilidade ("rodinha de bicicleta") porque o agente se perdia entre telas e motor.
**How to apply:** ao criar campo ligado novo, registrar o código antes; no dev nenhuma agenda médica tem janelas cadastradas (precisa cadastrar no Motor de Agenda).
