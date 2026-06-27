---
name: Webhook público que vincula canal de notificação a um cliente
description: Regras de segurança ao associar um chat/numero externo (ex.: Telegram chat_id) a um paciente via webhook público
---

Webhook público que grava um canal de notificação clínica num cliente (ex.: Telegram
`chat_id` em `clients.telegramChatId`) precisa de TRÊS camadas, senão vira sequestro de canal:

1. **Origem (fail-closed)**: validar segredo de origem (Telegram: cabeçalho
   `X-Telegram-Bot-Api-Secret-Token` contra `getSecret("telegram.webhookSecret")`).
   Sem segredo configurado OU divergente => responder 200 (Telegram reentrega em loop se
   não receber 200) mas NÃO gravar nada. Isso mata spoofing por HTTP direto.
2. **Prova de posse**: nunca vincular por identificador "público" (CPF/telefone cru) —
   qualquer um que o conheça assumiria o canal do outro. Exigir um segredo que SÓ o
   cliente tem (aqui: `clients.validationPassword`, comparada em UPPERCASE).
3. **Match único**: `validationPassword` NÃO é UNIQUE no schema. Filtrar TODOS os matches:
   `=== 1` vincula; `> 1` (colisão) NÃO vincula ninguém e audita (warn); `0` ignora.
   "primeiro match" (`rows.find`) é hijack por colisão.

**Why:** revisão do architect reprovou duas vezes — primeiro por CPF/telefone cru
(sequestro), depois por "primeiro match" em senha não-única (hijack por colisão).
**How to apply:** qualquer webhook futuro que ligue um endereço externo a um registro de
paciente segue as 3 camadas; e NUNCA logar o token/segredo (só `{isSet, masked}` nos status).
