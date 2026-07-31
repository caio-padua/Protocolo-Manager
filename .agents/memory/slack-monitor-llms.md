---
name: Slack Monitor de LLMs
description: Implementação do monitor de atividade de LLMs para o Slack PADUA-01, canal #padaxor-projeto.
---

# Slack Monitor de LLMs — PADUA-01

## Configuração

- **Workspace Slack**: PADUA - 01
- **Canal**: `#padaxor-projeto`
- **Channel ID**: `C0BLW5S7GQL`
- **Env var**: `PADAXOR_SLACK_CHANNEL_ID=C0BLW5S7GQL` (shared)
- **Connector ID**: `conn_slack_01KYRAMBWVC8NV4GAGFGGBR6GX` (status: added)
- **SDK**: `@replit/connectors-sdk` — já instalado no api-server

## Rotas implementadas

```
GET  /api/padaxor/slack/canais           — lista todos os canais do workspace
GET  /api/padaxor/slack/preview          — pré-visualiza o relatório (sem postar)
POST /api/padaxor/slack/relatorio        — posta o relatório no canal
GET  /api/padaxor/drive/planilha-status  — diagnóstico do arquivo .xlsx
POST /api/padaxor/drive/clonar-planilha  — clona .xlsx → Google Sheet nativo
```

Todas protegidas por `requireCeoInstance` (PADAXOR_AI_BYPASS=true).

## Arquivos

- `artifacts/api-server/src/lib/slack-reporter.ts` — core: buildLlmReport, postSlackReport, formatarRelatorioSlack
- `artifacts/api-server/src/routes/slack-padaxor.ts` — rotas
- `artifacts/api-server/src/routes/index.ts` — wired como `slackPadaxorRouter`

## Identidade do Slack

O connector usa **user token (xoxp)** — posts aparecem como Dr. Caio, não como bot.
Na fase atual não há dual-token separado; fallback automático para bot (xoxb) se user token expirar.

## Planilha que não abre

- **Arquivo**: `PADAXOR_LINHA_DE_PRODUCAO_26.07.29.xlsx`
- **File ID**: `1U84ZS2EcUR93Rd827-_QRPxQjVZueNHq`
- **Pasta Drive**: `1_oq50UEJo45YwdDZKvuI5awNuUf9Rqke`
- **Tamanho**: 0,04 MB — NÃO é problema de tamanho
- **Problema real**: formato .xlsx com conteúdo incompatível com o conversor do Google Drive
- **files.copy com mimeType conversion**: falha ("Conversion not supported")
- **files.create com download+re-upload**: falha ("part.body.pipe is not a function")

**Why**: `googleapis` espera um `Readable` stream no campo `media.body`, não um `Buffer`.
**Fix**: `const stream = Readable.from(Buffer.from(downloadResp.data as ArrayBuffer))` antes de passar ao `files.create`.

## Cron (pendente — Task #26)

Registrar em `artifacts/api-server/src/cron.ts` job às 08h BRT:
```typescript
buildLlmReport(24).then(report => postSlackReport("C0BLW5S7GQL", report));
```
