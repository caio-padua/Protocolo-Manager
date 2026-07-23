---
name: Drive-watcher + planilha comparativa de analitos
description: Padrão de importação automática de PDFs do Drive e exibição de analitos em prontuário
---

## Regra

1. `app.ts` dispara `processWatchedFolders` 2min após boot e depois a cada 4h via `setTimeout`+`setInterval`.
2. `extractPdfText` retorna objeto `PdfTextResult` (com campo `.text`) — nunca string crua.
3. Quando o PDF tem nome UUID (sem nome humano), `extractNameFromFilename` retorna `null` → arquivo vai para `pendente_revisao`.
4. Prontuário (`GET /api/prontuario/:clientId`) inclui campo `analitos` com até 2000 linhas de `examResultsTable`.
5. Frontend `PlanilhaComparativa` faz pivot: linhas = analito, colunas = data de coleta; células coloridas por status (normal/acima/abaixo).

**Why:** CEO pediu importação automática a cada 4h + planilha comparativa no prontuário.

**How to apply:** Ao adicionar novo padrão de nome de laboratório, editar apenas `extractNameFromFilename` em `lib/drive-watcher.ts`. Skill completa em `.agents/skills/drive-watcher/SKILL.md`.
