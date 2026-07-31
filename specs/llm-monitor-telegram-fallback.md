# Spec: LLM Monitor — Fallback Telegram + Histórico Dual-Canal
**Tasks:** #35, #36, #37
**Data:** 31/07/2026
**Autor:** Dr. Replit Paxter

---

## Objetivo

Garantir que (a) o aviso de falha do Telegram chegue ao Slack quando o Telegram recusa a mensagem; (b) o histórico da tabela `llm_reports_history` registre corretamente quando cada canal falha ou funciona; e (c) haja um endpoint para confirmar o comportamento de fallback sem depender de chatId real.

---

## Requisitos obrigatórios

1. **R1 — Histórico Telegram:** `postTelegramReport` deve gravar na tabela `llm_reports_history` um registro com `canal="telegram"` no bloco `finally` — espelhando exatamente o que `postSlackReport` já faz. O campo `enviado_ok` deve ser `true` só se o Telegram confirmou o envio (`resultado.sent === true`). O campo `erro` deve conter a mensagem de erro em caso de falha.

2. **R2 — Histórico combinado no dispatch:** `runLlmMonitorJob` (em `llm-monitor-dispatch.ts`) deve, ao final do ciclo, gravar um registro adicional com `canal="ambos"`, `enviado_ok` = `slackOk AND telegramOk`, e `erro` resumindo quais canais falharam (ou `null` se ambos OK). Só grava se `reportBuilt === true`.

3. **R3 — Fallback Slack visível:** quando todas as tentativas ao Telegram falham e `fallbackSlackChannelId` está presente, o aviso **já** é postado (código existente em `postTelegramReport` cobre isso — verificar que está operacional e que o texto do aviso menciona explicitamente qual foi o erro e quantas tentativas).

4. **R4 — Endpoint de teste do fallback:** `POST /api/padaxor/slack/test-fallback-telegram` (protegido por `requireCeoInstance`) que:
   - Constrói um relatório real via `buildLlmReport(0)`
   - Chama `postTelegramReport` com `chatId = "PADAXOR_TEST_FORCE_FAIL"` (string que o mock de `sendTelegram` deve reconhecer como forçar falha) e `fallbackSlackChannelId = PADAXOR_SLACK_CHANNEL_ID`
   - Retorna `{ telegramFailed: true, slackFallbackOk: boolean, erro: string, historicoId?: number }`

5. **R5 — sendTelegram reconhece chatId de teste:** a função `sendTelegram` em `telegram.ts` deve retornar `{ sent: false, mock: false, error: "TEST_FORCED_FAIL — chatId de teste" }` quando `chatId === "PADAXOR_TEST_FORCE_FAIL"`.

6. **R6 — `/api/padaxor/slack/status` mostra resultado dual:** o campo `historicoRelatorios.ultimoRegistro` já existe; adicionar `historicoRelatorios.falhasRecentes` = número de registros com `enviado_ok=false` nos últimos 7 dias (Slack OU Telegram).

---

## Casos extremos

- Telegram falha + Slack fallback também falha: deve logar `dupla falha` e gravar histórico com erro de ambos — NÃO lançar exceção não tratada.
- Telegram em modo MOCK (sem token): `enviado_ok = true`, `erro = null` (mock é considerado sucesso silencioso).
- `salvarHistorico` falha (banco indisponível): registrar warn no logger, NÃO propagar exceção (comportamento já existente).

---

## Definição de PRONTO

| Critério | Como conferir |
|---|---|
| R1: Após chamar `postTelegramReport` (mesmo em mock), existe linha `canal=telegram` no histórico | `SELECT * FROM llm_reports_history WHERE canal='telegram' LIMIT 1` via curl |
| R2: Após um ciclo completo via `POST /api/padaxor/slack/relatorio`, existe linha `canal=ambos` | mesma query, canal='ambos' |
| R3: Texto do aviso de fallback Slack contém `erro` e número de tentativas | conferir o texto hardcoded no código |
| R4: `POST /api/padaxor/slack/test-fallback-telegram` retorna `telegramFailed: true` e `slackFallbackOk: true` | curl |
| R5: `sendTelegram("PADAXOR_TEST_FORCE_FAIL", …)` retorna `sent: false, mock: false` | curl no R4 |
| R6: `/api/padaxor/slack/status` tem campo `falhasRecentes` numérico | curl |

---

## Linhas vermelhas

- NÃO alterar a assinatura pública de `postSlackReport` nem de `postTelegramReport` (assinatura de parâmetros).
- NÃO fazer DROP nem ALTER TABLE em `llm_reports_history` — se precisar de coluna nova, ADD COLUMN.
- NÃO remover o lançamento de exceção no final de `postTelegramReport` (o caller precisa saber que falhou).
- NÃO tocar no motor de cálculo de custos (`buildLlmReport`).
