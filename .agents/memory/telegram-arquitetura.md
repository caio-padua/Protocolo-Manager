---
name: Telegram — arquitetura do canal de comunicação com pacientes
description: Bot, fluxo de vinculação (chatId), encaminhamento de mensagens ao CEO, espelho WhatsApp→Telegram, e e-mail de onboarding. Ler antes de qualquer trabalho no canal Telegram do PADAXOR.
---

# Telegram — Arquitetura do Canal de Comunicação

## Bot da Clínica
| Campo | Valor |
|---|---|
| Username | @Paduaclinica_bot |
| Link direto | https://t.me/Paduaclinica_bot |
| Nome do bot | Instituto Padua |
| ID numérico do bot | 8804816459 |
| Token | cofre → `telegram.botToken` (NUNCA em env diretamente) |
| Webhook secret | cofre → `telegram.webhookSecret` |
| ChatId do CEO (Dr. Caio) | env → `PADAXOR_TELEGRAM_CHAT_ID` (Replit Secret) |

## Fluxo de vinculação do paciente (prova de posse)
1. Paciente baixa Telegram, abre @Paduaclinica_bot
2. Envia a `validationPassword` do seu cadastro (campo `clients.validationPassword`)
3. Webhook `/webhooks/telegram` (em `assinaturas.ts`) valida o segredo de origem e a senha
4. Se validação OK: grava `chatId` em `clients.telegramChatId`
5. Paciente recebe boas-vindas automáticas; CEO recebe notificação de nova vinculação

## Comportamento do webhook (assinaturas.ts)

```
chatId já vinculado? → encaminha mensagem ao CEO via sendTelegram(PADAXOR_TELEGRAM_CHAT_ID)
chatId não vinculado + senha válida → vincula + boas-vindas ao cliente + notifica CEO
chatId não vinculado + sem senha → envia instruções de como ativar ao cliente
```

## Espelho WhatsApp → Telegram (whatsapp.ts)
Toda mensagem enviada via `sendWhatsapp(phone, msg, { clienteId })` também é enviada ao Telegram do cliente (se `clients.telegramChatId` estiver preenchido). Funciona como fire-and-forget: não bloqueia o WhatsApp, não afeta o valor de retorno.

**Why:** CEO determinou em 10/08/2026 que tudo enviado via WhatsApp deve também chegar pelo Telegram.

## E-mail de Onboarding Telegram
Função: `sendTelegramOnboardingEmail(data)` em `email-service.ts`.

Envia e-mail PADAXOR (navy/gold) com 3 passos visuais:
1. Baixar o Telegram (links App Store + Google Play)
2. Buscar @Paduaclinica_bot
3. Enviar a `validationPassword` do cliente

**Como disparar:** `POST /api/email/telegram-onboarding/:clientId` (rota em email.ts).

## Regras de segurança do webhook
- Defesa 1: Header `X-Telegram-Bot-Api-Secret-Token` deve bater com `telegram.webhookSecret` (fail-closed)
- Defesa 2: Prova de posse via `validationPassword` única — colisão → recusa total
- Webhook sempre responde HTTP 200 (Telegram reenviaria em loop se diferente)
- NUNCA logar o token do bot

## How to apply
- Qualquer nova rota que envia Telegram deve usar `sendTelegram` de `lib/telegram.ts`
- Token é auto-carregado do cofre via `ensureTelegramTokenLoaded()` na primeira chamada
- Sem token: modo MOCK (loga só metadados, nunca falha o boot)
- Para verificar bot configurado: `GET /api/padaxor/telegram/meu-chat-id` (retorna botInfo + chatId do CEO)
