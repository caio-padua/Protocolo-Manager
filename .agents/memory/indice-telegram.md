---
name: Índice Telegram
description: Índice de decisões agrupadas para preservar referências e reduzir o índice principal.
---

- [Telegram bot compartilhado — takeover](telegram-bot-compartilhado-takeover.md) — quem faz polling consome updates; setWebhook assume com exclusividade (quebra o primo); setMyName renomeia via API.
- [Telegram — arquitetura do canal com pacientes](telegram-arquitetura.md) — @Paduaclinica_bot; vinculação por validationPassword; espelho WhatsApp→Telegram; e-mail onboarding; webhook encaminha ao CE
- [Chat do CEO no Telegram — cofre x Secret](telegram-ceo-chatid-cofre-vs-secret.md) — Secret PADAXOR_TELEGRAM_CHAT_ID está errado; só a API hidrata o cofre; worker e scripts não.
- [Telegram — chat do CEO, repasse e status](telegram-diagnostico-repasse-ceo.md) — webhook único aponta para um ambiente; repasse ao CEO sem eco; status honesto na Central de Auditoria.
- [Lembrete no Telegram](lembrete-telegram-motor.md) — mesmo motor, canal por modo em app_settings; janela leva só seus períodos; prova automática isolando o Job 2.
- [Assistente de agendamento no Telegram](telegram-assistente-agendamento.md) — cliente reserva real, visitante vira pedido; planejar do pipeline durável; testar via vitest.
