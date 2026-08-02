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

## Gravar o historico NAO pode derrubar o ciclo — e `.catch()` nao basta

O passo 4 usava `await deps.salvarHistorico(...).catch(() => {})`. Isso so protege
contra PROMESSA RECUSADA. Se `salvarHistorico` estourar de forma SINCRONA — um
`throw` antes do primeiro `await`, um deps mal montado, um mock — a excecao escapa
antes de o `.catch` existir, e `runLlmMonitorJob` rejeita.

**Why:** contraria o contrato escrito no proprio docblock ("Nunca relança exceção")
e derruba um ciclo cujos DOIS canais ja tinham entregue. Perder o registro do
historico e menos grave que estourar o ciclo inteiro.

**How to apply:** envolver em `try/catch`, nunca em `.catch()` encadeado, sempre que
a funcao vier de fora por injecao de dependencia. Vale para qualquer `deps.*` opcional.

Corrigido em 01/08/2026. O teste 13 de `llm-monitor-dispatch.test.ts` cobre as DUAS
formas de falhar (promessa recusada e excecao sincrona) — ele reprovava antes da
correcao.

## O bloco do Art. 70 ficou 5 dias sem teste nenhum

O `makeDeps()` do arquivo de teste nunca injetava `salvarHistorico`. Como o campo e
OPCIONAL em `LlmMonitorDeps`, ficava `undefined` nos 8 cenarios e o passo 4 inteiro
— o registro "ambos", o coracao do Art. 70 — nao executava em teste algum.

**Why:** campo opcional em objeto de dependencias e um ponto cego classico: o codigo
compila, os testes passam, e o caminho simplesmente nao roda. A regra que o architect
reprovou uma vez (telegramSkipped como sucesso) podia voltar sem ninguem notar.

**How to apply:** ao tornar uma dependencia opcional, escrever no mesmo commit um
teste que a injeta. Se nenhum teste passa a dependencia, o ramo que a usa e codigo
nao coberto por definicao.

## ChatId de teste

`sendTelegram("PADAXOR_TEST_FORCE_FAIL", ...)` retorna `{ sent: false, mock: false, error: "TEST_FORCED_FAIL" }`
sem chamada real à API do Telegram. Endpoint de teste: `POST /api/padaxor/slack/test-fallback-telegram`.
