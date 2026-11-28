---
name: Telegram webhook — reivindicação, outbox e config única
description: regras duráveis do recebimento e repasse do Telegram (dedupe por bot+update, outbox, chat de alerta único)
---

- Dedupe por (identidade numérica do bot, update_id) para TODOS os fluxos. Reentrega de "processando" recente = 500 (nunca 200: perderia a mensagem se o 1º processamento falhar); concluído = 200 sem efeito; falha de banco/cofre passageira = 500.
- A reivindicação tem `dono`; só o dono conclui/libera, e o fechamento ocorre ANTES de a resposta HTTP sair (res.json interceptado).
- Repasse ao chat de alerta: outbox `telegram_repasse_ceo` registrado antes do 200; "incerto" (rede caiu/processo caiu) NUNCA é reenviado sozinho. A retomada roda no api-worker (cron.ts do api-server é legado e não é chamado).
- Chat de alerta: sempre `lib/telegram-config.ts` (cofre > ambiente, numérico). Nunca ler process.env direto; o Secret do ambiente é inválido e o worker não hidratava.
- Vínculo ambíguo (mesmo chat em 2+ clientes): não escolhe; grava em `telegram_vinculo_pendencias`.

**Why:** revisão independente achou janelas de perda (200 antes do registro, ACK antes do fechamento, 200 em falha do cofre) e worker sem execução.
**How to apply:** ao tocar o webhook, manter 500 para falha passageira e registrar o repasse de forma durável antes de responder; testes de rota precisam mockar `telegram-config` (lê o ambiente) porque o resolver real usa o cofre.
