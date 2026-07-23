---
name: Motor de extração v2 — isHistory e lab name
description: Comportamento do campo isHistory e da detecção de laboratório no motor de extração de exames
---

## Campo isHistory

- `exam_results.is_history BOOLEAN NOT NULL DEFAULT FALSE`
- `persist.ts` insere `isHistory: true` nos loops de historico (pontos onde `analyte.history[]` não está vazio)
- Uma coluna do comparativo é marcada como "toda histórica" quando TODOS os seus rows têm `isHistory=true` (mapa `colIsHistory`: qualquer `isHistory=false` vence)
- UI: badge âmbar "Histórico" em `AnalytoRow` (por analito) e no cabeçalho de `ColunaCabecalho` (por coluna)

## Lab name (nome do laboratório)

- **pdf-parse** (text extraction): NÃO detecta timbre/logo — retorna só o texto bruto do PDF
- **Gemini Vision** (PDFs escaneados): detecta via MEDIA_SUFFIX com instrução explícita de buscar timbre, rodapé e URL de validação
- Mesmo com instrução explícita, PDFs com UUID como nome (sem contexto visual claro) podem retornar `labName=null`
- **Solução**: campo editável inline em `ProcedenciaDocumentosBloco` → clicar na célula "Laboratório" → digitar → Enter → `PATCH /api/exames-lab/documento/:id` grava no `exam_documents.lab_name`

## How to apply

- Ao adicionar novo step de persistência, sempre passar `isHistory` explicitamente
- Ao depurar lab name nulo: verificar se o PDF é escaneado (Gemini) ou tem texto (pdf-parse)
- Nunca usar o nome do arquivo como proxy do laboratório (UUIDs e hashes são comuns)
