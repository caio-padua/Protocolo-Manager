---
name: Assistente de agendamento no Telegram
description: Como a assistente virtual marca consultas por Telegram (cliente x visitante) e limites de segurança
---
- Regra pura em telegram-agendamento.ts; ligações reais em telegram-agendamento-store.ts; clientes entram pelo planejar do pipeline durável (resposta com até ~1 min, depende do api-worker); visitantes são atendidos síncronos no webhook.
**Why:** reserva só é dita depois de bookSession gravar; visitante nunca reserva (vira pedido para a equipe); queixa de saúde nunca é tratada pela assistente.
**How to apply:** fluxo novo de agendamento deve reaproveitar bookSession/computeResourceSlots; visitante só atendido se chat estiver em atendimento.visitantes.permitidos e modo != desligado. Migração das tabelas vive em aplicarMigracaoAtendimento (teste com banco descartável só migra por ela). Teste de reserva real: vitest com banco de dev e cancelBooking (tsx quebra por rrule ESM).
