---
name: Chat do CEO no Telegram — cofre manda, Replit Secret está errado
description: PADAXOR_TELEGRAM_CHAT_ID tem dois valores (Replit Secret e cofre); só a API hidrata o cofre
---

O valor numérico correto do chat do CEO mora no cofre (`telegram.ceoChatId`). O Replit Secret `PADAXOR_TELEGRAM_CHAT_ID` guarda um texto que não é número (o Telegram responde "chat not found").

**Why:** a API sobrescreve o ambiente com o cofre no boot (`hydrateEnvFromVault`), então tudo funciona nela; script avulso e `api-worker` NÃO hidratam e leem o Secret errado.

**How to apply:**
- Teste que envia ao CEO fora da API deve ler o chat via `getSecret("telegram.ceoChatId")`, nunca de `process.env`.
- Qualquer aviso ao CEO disparado pelo `api-worker` falha em silêncio até o Secret ser corrigido ou o worker hidratar o cofre.
- Script ad hoc só resolve `@workspace/*` se estiver dentro de `artifacts/api-server`; apagar ao terminar.
- Teste real de canal: lista de permissão (só e-mail e chat do CEO), WhatsApp desligado.
