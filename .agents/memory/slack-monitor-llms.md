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

## Cron — Job 5 implementado (Task #26 concluída)

Local CORRETO: `artifacts/api-worker/src/worker.ts` (não cron.ts — startCronJobs está desativado no api-server).
Padrão idêntico aos Jobs 1-4: importação dinâmica de `../../api-server/src/lib/slack-reporter.js`.
Guard: `if (process.env.PADAXOR_AI_BYPASS !== "true") return;` — clones ignoram.
Execução: 08:00 BRT, timezone: "America/Sao_Paulo".

**Build do api-worker**: erro pré-existente ("Cannot find module 'thread-stream'") — não causado pelo Job 5.
O worker roda no Railway (não há workflow local para ele).

## Histórico de relatórios (llm_reports_history)

Tabela criada via raw SQL (não está no schema Drizzle). Campos: id, gerado_em, gerado_em_brt, periodo_horas, total_chamadas, total_custo_usd, mudancas_planilha, stats_json (JSONB), divergencias (JSONB), canal, enviado_ok, erro.
`salvarHistorico()` é chamada no `finally` de `postSlackReport()` — grava sempre, mesmo em falha.
Rota de consulta: `GET /api/padaxor/slack/historico?dias=N` (padrão 7, máx 90).
Estado da planilha para comparação horária: `/tmp/padaxor-planilha-estado.json` — reseta no restart (aceitável; pior caso = falso positivo de "novo item").

## Glossário — regra de números permanentes

`(*N)` = posição 1-based no array `GLOSSARIO` em `slack-glossario.ts`. NUNCA recalcular por mensagem.
Bug corrigido em 31/07/2026: numeração dinâmica → permanente.
Dr. Code deve criar `DICIONARIO.md` no GitHub com os mesmos 55 termos na mesma ordem. Spec: `specs/dicionario-numeros-permanentes.md`.

## Planilha de Produção (assumida como oficial)

- **ID oficial**: `1SW6K2JNUEP4i1I16v_ZYhtwxTpUkT_dx3ERHkj9HQcw`
- **Nome**: "PADAXOR — LINHA DE PRODUCAO (completa)"
- **Pasta Drive**: `1_oq50UEJo45YwdDZKvuI5awNuUf9Rqke`
- **Abas**: 1 aba "Untitled" (renomear para algo descritivo é recomendado)
- **Colunas**: Nº | Item | Responsavel | Estado | Prioridade | Depende de | Em linguagem de leigo | Esforco
- **Total de itens**: 49 (após adição do Monitor de LLMs)
- **Arquivos apagados da pasta**: PADAXOR_ESTAGIO_DA_OBRA e PADAXOR_LINHA_DE_PRODUCAO_26.07.29.xlsx (lixeira)

**Atualizações feitas em 31/07/2026:**
- Item #18 AGUARDANDO → CONCLUIDO (ai_usage_log implementado)
- Item #42 A FAZER → CONCLUIDO (requireCeoInstance implementado)
- Item #43 A FAZER → PARCIAL (CF Gateway criado, BASE_URL ainda no Replit)
- Item #49 NOVO → CONCLUIDO (Monitor de LLMs no Slack)

## Rota de leitura direta do Slack (adicionada em 01/08/2026)

`GET /api/padaxor/slack/mensagens?canal=padaxor-projeto&limite=50`

- Usa `slackGet` (agora exportado de slack-reporter.ts) + `listarCanaisSlack`
- Resolve o problema: conector Slack existe no servidor, mas não na sessão de chat dos agentes
- Testada: retornou 10 mensagens reais incluindo todas as de Dr. Manus de 31/07
- `slackGet` deve permanecer exportado — outros módulos podem precisar dele
- Canal ID confirmado: C0BLW5S7GQL (#padaxor-projeto)

## O que o Dr. Manus postou no Slack em 31/07/2026 (descoberto via nova rota)

Horários BRT:
- 21:17 — Apresentou-se; missão declarada: resolver item #36
- 21:18 — Registrou itens 60-63 na planilha (auditoria, não código):
  - 60: Auditoria Cockpit V2 (Zustand + Motion v12 + Lazy Loading)
  - 61: Auditoria fluxo Upload→Drive→Gemini→Cockpit
  - 62: Criação de rota POST /exames-lab/reprocessar/:id (proposta)
  - 63: Relatório de integração
- 21:58 — Proposta estratégica (passos, armadilhas, kaizen)
- 22:09 — Proposta estratégica mais detalhada
- 22:27 — Respondeu ao Dr. Code: admitiu que trabalha em telas separadas e não commita no repo; reconheceu que é problema de coordenação
- 22:54 — Relatório de auditoria do Cockpit V2 (commit main 067933e vs commit Replit 839d08d)
- 22:55 — Propostas de fix para aprovação ANTES de qualquer commit (inclui fix TS2322 App.tsx)

**Conclusão:** Dr. Manus trabalha 100% fora do repositório. Itens 60-63 são análises e propostas, não código mergeado.
