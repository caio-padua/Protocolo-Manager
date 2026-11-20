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

## Link mágico — travas de vínculo que não podem ser afrouxadas
Dois caminhos de ativação convivem e nenhum substitui o outro: link mágico (`/start TOKEN`) e senha de validação.

- Consumir o token é UM ÚNICO UPDATE condicional (uso único + validade + `telegram_chat_id IS NULL`). Nunca ler-depois-gravar.
- `telegram_chat_id` tem índice único parcial: **um celular = um paciente**. A violação (23505) vira recusa educada + aviso ao CEO, nunca erro 500.
- Emitir link para cadastro **já vinculado** é recusado (409) em todas as rotas de onboarding: link válido na caixa de e-mail de paciente ativo é chave sobrando.
- `/start` de quem já está vinculado responde "já vinculado" e **não** entra no inbox clínico.

**Why:** credenciais de ativação não podem transferir um chat que já tem dono nem misturar históricos clínicos.
**How to apply:** preservar as duas formas de ativação e verificar a exclusividade do vínculo mesmo sob solicitações simultâneas.

## Porta de entrada e liberação (17/11/2026)
- Número de celular no Telegram é conta pessoal: NÃO se liga a bot. O caminho é link/QR `t.me/<bot>` (Central Telegram, painel "Porta de entrada do bot") ou link individual `?start=<token>` (cartão "Foto e Contato do Cliente", botão LIBERAR TELEGRAM, usa `/clients/:id/telegram-link`).
- Atendimento da assistente: `atendimento.ia.modo` = desligado/lista/ligado; em "lista" só clientes em `atendimento.ia.permitidos` (por id de cliente) são atendidos; visitante só em "ligado" ou chat na lista de visitantes. Não existe tela para mudar o modo (decisão do CEO pendente).
- Alternativa que liga bot a número: Telegram Business "Chatbots" (exige Premium na conta); não implementada.

## Respostas e aprendizado da assistente
- A IA interpreta, mas não redige a mensagem final; o envio deve copiar texto de uma frase ou orientação aprovada.
- Não enviar CPF, data de nascimento ou outros identificadores ao provedor; o aprendiz só pode padronizar perguntas seguras e copiar a resposta aprovada sem alterá-la.
- Nunca aprender conteúdo clínico, preço sem fonte válida ou informação ausente; em dúvida, encaminhar para a equipe.

**Why:** o CEO definiu que o assistente reduz custo sem inventar respostas nem ampliar o risco clínico ou de privacidade.
**How to apply:** qualquer mudança no Telegram que use IA precisa manter separadas interpretação, conferência e resposta aprovada; editar uma FAQ aprendida não deve alterar mensagens já em andamento.

## Direção futura: dúvidas sobre receituário
- O CEO quer que uma evolução futura consulte o receituário, as fórmulas e os protocolos da própria cliente, explique em linguagem simples e ofereça o reenvio do documento.
- Esse fluxo é separado do aprendiz de perguntas frequentes: não aprende conteúdo clínico nem está disponível no bot atual.
- Antes de existir, a pergunta sobre receituário continua sendo encaminhada à equipe; não inferir o registro pelo nome nem enviar documento sem confirmação explícita da cliente.

**Why:** a cliente deve conseguir entender o próprio documento e pedir uma segunda via, sem expor receita a outra pessoa nem alterar uma orientação clínica.
**How to apply:** implementar como fluxo clínico autenticado, restrito ao registro confirmado; escolher uma fonte aprovada para explicar a fórmula e validar destinatário e documento antes de oferecer o reenvio.
