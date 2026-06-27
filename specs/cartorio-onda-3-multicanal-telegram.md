# Spec — Cartório Onda 3: Distribuição Multicanal (+ Telegram novo)

Data: 26/06/2026. Método: Paxter Loop. Pai: `specs/cartorio-master.md`. Depende de: Onda 1.

## Objetivo (uma frase)
Entregar o link de assinatura ao paciente por mais de um canal — e-mail, Google Drive (pasta dele),
WhatsApp e Telegram — escolhendo quais canais usar no momento do envio.

## Requisitos exatos
1. No envio (Onda 1), permitir marcar os canais desejados: E-MAIL, WHATSAPP, DRIVE, TELEGRAM. Persistir
   em `canais_distribuir` da solicitação e enfileirar em `assinatura_notificacoes` por canal.
2. E-MAIL: reusar `lib/email-service.ts` / `sendGmailMessage` — assunto e corpo com o link de assinatura.
3. WHATSAPP: reusar `lib/whatsapp.ts` (`sendWhatsapp`) com fallback `wa.me` (já existe).
4. DRIVE: ao gerar o documento, subir o PDF (não assinado, "para assinar") na pasta CONTRATOS/TERMOS do
   paciente via `uploadFileToDrive`, com nome padrão `YY.MM.DD TIPO NOME (A ASSINAR).pdf`.
5. TELEGRAM (NOVO): criar `lib/telegram.ts` com `sendTelegram(chatId, message)` usando a Bot API
   (`https://api.telegram.org/bot<token>/sendMessage`). Token via cofre (`telegram.botToken`), MODO MOCK
   se ausente. Campo `telegramChatId` no cliente (novo) para guardar o destino.
6. Onboarding do Telegram: como o paciente precisa iniciar o bot uma vez, gerar deep link
   `t.me/<bot>?start=<token>` e capturar o `chat_id` via webhook `POST /api/webhooks/telegram` que
   associa o `chat_id` ao paciente pelo token. (Sem isso, Telegram fica indisponível para aquele paciente.)
7. Processamento da fila por endpoint `POST /api/assinaturas/processar-notificacoes` (worker chama, sem
   cron externo), usando `Promise.allSettled` para um canal falho não derrubar os demais.

## Casos extremos
1. Canal marcado mas paciente sem aquele contato (ex.: sem chat_id Telegram) → pular esse canal e
   registrar o motivo na notificação; não falhar os outros (allSettled).
2. Token Telegram ausente → MODO MOCK (loga o que enviaria), não quebra.
3. Falha de upload no Drive → best-effort com re-tentativa; nunca reverte a solicitação.
4. Duplicar envio do mesmo canal → idempotência por (solicitacao_id + canal).

## Linhas vermelhas
Herda da spec-mãe. NÃO logar o token do bot. Telegram é canal ADICIONAL — sua ausência nunca bloqueia
o envio por e-mail/WhatsApp.

## Definição de PRONTO
| Critério | Como conferir |
|---|---|
| Escolher canais no envio | screenshot |
| E-mail/WhatsApp/Drive disparam | logs + arquivo no Drive |
| `lib/telegram.ts` envia (ou MOCK sem token) | curl/log |
| Webhook Telegram associa chat_id ao paciente | SELECT no cliente |
| Um canal falho não derruba os outros | teste com 1 canal quebrado |
| architect PASS, zero pendência | revisão requisito por requisito |

## O que só o CEO faz
Criar o bot no BotFather e colar o token no cofre (`telegram.botToken`); apontar o webhook do bot para
`POST /api/webhooks/telegram`.

RESUMO EM 1 LINHA: enviar o link de assinatura por e-mail, WhatsApp, Drive e Telegram (canal novo), com
fila resiliente (allSettled) e Telegram em MODO MOCK até o CEO colar o token do bot.
