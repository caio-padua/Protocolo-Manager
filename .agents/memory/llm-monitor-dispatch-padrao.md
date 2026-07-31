---
name: LLM Monitor dispatch — padrão de histórico dual-canal
description: Regras do registro de histórico para o monitor horário de LLMs (Slack + Telegram).
---

## Regra

`postTelegramReport` grava `canal="telegram"` no `finally` block (espelha `postSlackReport`).
`runLlmMonitorJob` grava `canal="ambos"` via `deps.salvarHistorico` opcional após os dois canais.

**`ambosOk` = `slackOk AND telegramOk`** — telegramSkipped NÃO é sucesso dual-canal.
Quando telegramSkipped, o campo `erros` registra "Telegram não configurado (PADAXOR_TELEGRAM_CHAT_ID vazio)".

**Why:** o architect reprovou a versão que tratava `telegramSkipped` como sucesso —
o CEO perderia visibilidade de que o Telegram não estava entregando.

## Como aplicar

- `salvarHistorico` deve ser EXPORTADA de `slack-reporter.ts` (não private).
- `LlmMonitorDeps.salvarHistorico` é opcional — worker passa, testes não precisam.
- Worker injeta `reporter.salvarHistorico` no deps de `runLlmMonitorJob`.
- Early return para `!telegramChatId` foi substituído por `else {}` para o step 4 sempre rodar.

## ChatId de teste

`sendTelegram("PADAXOR_TEST_FORCE_FAIL", ...)` retorna `{ sent: false, mock: false, error: "TEST_FORCED_FAIL" }`
sem chamada real à API do Telegram. Endpoint de teste: `POST /api/padaxor/slack/test-fallback-telegram`.
