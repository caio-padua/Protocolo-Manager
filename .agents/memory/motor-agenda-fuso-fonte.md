---
name: Motor de Agenda — fuso da clínica e fonte de ocupação
description: Ancorar horários no fuso da clínica (BRT) e não inventar fonte de dado quando o vínculo real é de fase futura.
---

# Motor de Agenda — fuso e fonte de ocupação

## Fuso da clínica é BRT fixo (UTC-3)
A clínica opera em Brasília (UTC-3, sem horário de verão desde 2019). O servidor Replit roda em UTC.
- Para o instante de um slot (regra de antecedência mínima), construir com offset explícito: `new Date(`${date}T${time}:00-03:00`)`.
- Para dia da semana de uma data ISO, usar determinístico em UTC: `new Date(`${date}T12:00:00Z`).getUTCDay()` (meio-dia UTC evita borda).

**Why:** `new Date(`${date}T${time}:00`)` é interpretado no fuso implícito do servidor (UTC), deslocando o instante em 3h e podendo errar a fronteira de antecedência (off-by-one de dia/hora) nas bordas.

**How to apply:** qualquer cálculo de horário/agenda no Manager ancora no fuso da clínica; nunca confiar no fuso implícito do servidor.

## Não inventar fonte de ocupação de fase futura
A tabela `sessions` tem `professionalId` mas NÃO tem `resourceId` — o vínculo sessão↔recurso é a fase de marcação real (F2.3), ainda não construída.
- Errado: derivar ocupação do `professionalId` do recurso (colide recursos do mesmo profissional; recurso sem profissional nunca ocupa).
- Certo: a rota de slots recebe a ocupação por entrada explícita (query `occupied`, CSV HH:mm) para a Prova Viva demonstrar a cadeia, com comentário no código e no OpenAPI de que a ocupação real chega na marcação (F2.3).

**Why:** inventar uma fonte semanticamente errada só para "ter dado" gera comportamento incorreto e enganoso; o motor anti-ilha aceita ocupação como entrada, então a fonte real pode plugar depois sem tocar o motor.

**How to apply:** quando o vínculo real de um dado pertence a uma fase futura, usar entrada explícita e marcar a fonte real como fase futura — nunca um proxy errado.
