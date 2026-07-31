---
name: Slack Report Formato V2 — cabeçalho + tabela + handoff
description: Padrão do relatório Slack após evolução de 31/07/2026 — 3 blocos novos no Block Kit.
---

## Regra
O relatório do Monitor Horário de LLMs (slack-reporter.ts) produz 3 blocos novos além dos existentes:

1. **Context block do cabeçalho** — inclui "✍️ Última entrada: #N 'item' · _agente_" (campo `ultimoPreenchimento` do report).
2. **Bloco emoldurado de CONCLUÍDOS** — tabela monospace 4 colunas (Nº / Item / Agente / Solicitado por) com box-drawing chars, dentro de triple-backtick. Aparece SEMPRE que há itens CONCLUIDO na planilha.
3. **Bloco de Handoffs** — lista bullets com "• #N 'item' ← _solicitacao_". Aparece SOMENTE se algum item CONCLUIDO tiver `solicitacao` preenchida (coluna I da planilha).

## Planilha — estrutura de colunas (A:I)
| Col | Campo       | Notas |
|-----|-------------|-------|
| A   | nro         | número do item |
| B   | item        | descrição curta |
| C   | resp        | agente responsável (ex: "Dr. Replit") |
| D   | estado      | A FAZER | AGUARDANDO | CONCLUIDO |
| E   | prio        | P0 critico | P1 alto | P2 medio | P3 baixo |
| F   | hash        | sessão de referência |
| G   | descricao   | descrição longa |
| H   | notas       | notas de entrega |
| I   | solicitacao | handoff inter-LLM (ex: "Dr. Claude → Dr. Replit: spec dual-canal") |

## Funções novas em slack-reporter.ts
- `montarTabelaConcluidos(items)` — gera a tabela box-drawing monospace
- `montarHandoffs(items)` — filtra itens com `solicitacao` não vazia e gera bullets
- `UltimoPreenchimento` — tipo exportado com nro, item, resp, solicitacao?
- `LlmReport.itensConcluidos` — todos os ItemPlanilha com estado=CONCLUIDO
- `LlmReport.ultimoPreenchimento` — item com maior nro numérico

**Why:** CEO pediu em 31/07/2026 que o Slack mostrasse: quem preencheu, tabela emoldurada dos concluídos, e o que uma LLM pediu à outra.
**How to apply:** `lerPlanilha()` lê A2:I200 (9 colunas). `buildLlmReport()` computa `itensConcluidos` e `ultimoPreenchimento`. `formatarRelatorioSlack()` usa os helpers acima.
