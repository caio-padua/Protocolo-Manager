---
name: Slack Report Formato V2 — cabeçalho + tabela + handoff
description: Padrão do relatório Slack após evolução de 31/07/2026 e atualização de colunas em 01/08/2026.
---

## Regra
O relatório do Monitor Horário de LLMs (slack-reporter.ts) produz 3 blocos além dos existentes:

1. **Context block do cabeçalho** — inclui "✍️ Última entrada: #N 'item' · _agente_" (campo `ultimoPreenchimento`).
2. **Bloco emoldurado de CONCLUÍDOS** — tabela monospace 6 colunas (Nº / Data / Hora / Item / Agente / Pedido) com box-drawing chars, dentro de triple-backtick. Aparece SEMPRE que há itens CONCLUIDO na planilha.
3. **Bloco de Handoffs** — lista bullets. Aparece SOMENTE se algum item CONCLUIDO tiver `solicitacao` preenchida.

## AUTO-PREENCHIMENTO DATA/HORA
Quando o sistema detecta mudança de estado em um item, grava automaticamente a DATA (DD/MM/AAAA) e HORA (HH:MM) BRT nas colunas B e C — só se estiverem vazias (não sobrescreve). Função: `escreverDataHoraSeVazio(linhaSheet, dataAtual, dataFmt, horaFmt)`.

## Planilha PADAXOR — LINHA DE PRODUCAO — estrutura ATUAL (após CEO inserir colunas em 01/08/2026)
| Col | Índice array | Campo       | Notas |
|-----|-------------|-------------|-------|
| A   | 0           | nro         | número do item |
| B   | 1           | data        | DATA de conclusão — DD/MM/AAAA (auto-preenchido) |
| C   | 2           | hora        | HORA de conclusão — HH:MM BRT (auto-preenchido) |
| D   | 3           | item        | descrição curta |
| E   | 4           | resp        | agente responsável |
| F   | 5           | estado      | A FAZER | AGUARDANDO | CONCLUIDO |
| G   | 6           | prio        | P0 critico | P1 alto | P2 medio | P3 baixo |
| H   | 7           | hash        | Depend.de / sessão de referência |
| I   | 8           | descricao   | Em linguagem de leigo |
| J   | 9           | notas       | notas de entrega |
| K   | 10          | solicitacao | handoff inter-LLM |

**lerPlanilha()** lê A2:K200 (11 colunas). `ItemPlanilha.linhaSheet` = idx+2 (para escrita).
Filter: r[0] (Nº) E r[3] (Item) obrigatórios.

## Tabela de CONCLUÍDOS — 6 colunas (nova, com DATA e HORA)
Nº (4) | Data (10) | Hora (5) | Item (30) | Agente (14) | Pedido/Handoff (22)

**Why:** CEO inseriu colunas DATA e HORA na planilha em 01/08/2026 para billing pay-per-use e rastreamento de quando cada item foi concluído.
**How to apply:** NUNCA usar índice antigo (item=r[1], resp=r[2]). Usar novo mapa acima. range="A2:K200".
