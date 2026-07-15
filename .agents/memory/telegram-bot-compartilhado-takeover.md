---
name: Telegram bot compartilhado — takeover por webhook
description: Bot compartilhado entre sistemas primos: quem faz polling consome os updates; setWebhook assume o canal com exclusividade; setMyName renomeia via API.
---

Regra: um bot do Telegram só tem UM consumidor de updates. Se outro sistema (ex.: IHE) faz polling `getUpdates`, ele consome as mensagens em segundos e o novo sistema "escuta" zero mesmo com token válido.

**Como assumir (decisão explícita do CEO, opção B em 15/07/2026):** `setWebhook` com `secret_token` + `drop_pending_updates=true` → o polling do sistema antigo passa a receber 409 e todos os updates fluem ao webhook. Isso QUEBRA o canal do sistema antigo — nunca fazer sem consentimento.

**Vínculo do chatId:** o webhook do Manager (`/api/webhooks/telegram`) só grava `clients.telegram_chat_id` com prova de posse = `validation_password` na mensagem (match ÚNICO). Para testar: definir senha no cadastro-alvo, CEO manda a senha ao bot, chatId gravado automático.

**Renomear bot via API:** `POST /setMyName` (Bot API 6.7+) muda o display name sem BotFather.

**Why:** três escutas longas de getUpdates retornaram 0 apesar de mensagens visíveis no chat — causa era o consumidor do IHE, não token/config.

**How to apply:** antes de depurar "bot não recebe", verificar se o bot é compartilhado (histórico do chat denuncia: mensagens de outro sistema) e `getWebhookInfo`.
