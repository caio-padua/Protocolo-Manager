---
name: Multi-IA pipeline + reprocessar — padrão de colunas ALTER TABLE
description: Como integrar múltiplos LLMs em cadeia no processamento de exames e como fazer reprocessamento individual por documentId.
---

## Regra

As 3 colunas de auditoria multi-IA (`reprocessamento_count INT DEFAULT 0`, `reprocessado_at TIMESTAMPTZ`, `llm_pipeline JSONB DEFAULT '[]'`) foram adicionadas via `ALTER TABLE exam_documents` (executado diretamente em SQL — **nunca** via `db push`). Elas **não** existem no schema Drizzle.

**Why:** `db push` com `NOT NULL` em tabela populada exige DROP/TRUNCATE preventivo, violando a Regra de Ouro do CEO (nunca dropar). Raw SQL com ALTER TABLE é o único caminho seguro.

## Como acessar essas colunas

- **Leitura:** usar `db.execute(sql\`SELECT reprocessamento_count, reprocessado_at, llm_pipeline FROM exam_documents WHERE id = ${id}\`)`.
- **Escrita (reprocessar):** `db.execute(sql\`UPDATE exam_documents SET status='processando', reprocessamento_count=COALESCE(reprocessamento_count,0)+1, reprocessado_at=NOW() WHERE id=${id}\`)`.
- **Escrita (pipeline):** chamar `finalizeDocument()` primeiro (que usa Drizzle normal), depois atualizar `llm_pipeline` com raw SQL separado. Isso garante que Drizzle não toca as colunas extras.

## Pipeline Multi-IA (cadeia Gemini → Claude → OpenAI)

- `processExamDocument` lê 3 settings: `exames.llmGeminiAtivo` (padrão true), `exames.llmClaudeAtivo` (padrão false), `exames.llmOpenaiAtivo` (padrão false).
- Cada LLM ativo chama seu extractor (`extract.ts`, `extract-anthropic.ts`, `extract-openai.ts`).
- `mergeExtractions(base, extra)` faz **union por nome normalizado** (toLowerCase().trim()) — não substitui, só adiciona analitos ausentes no base.
- `llmPipeline[]` registra provider/model/ok/analitos/ms/error de cada passo.
- `finalizeDocumentWithPipeline()` = `finalizeDocument()` + raw SQL UPDATE llm_pipeline.

## Reprocessar individual

- Rota: `POST /api/exames-lab/reprocessar/:id` (requireCollaborator).
- Busca buffer: cofre interno (`getInternalCopy`) → Google Drive (`driveDownloadFile`).
- Se nenhum disponível → 422 com mensagem explicativa.
- Fire-and-forget: `void processExamDocument(...)` — não aguarda no request.
- Status público (sem auth): `GET /api/exames-lab/doc-status/:documentId`.

## Auditoria com colunas extras

A rota GET /exames-lab/auditoria faz **2 queries separadas** (uma Drizzle-compatível + uma raw SQL para as colunas ALTER TABLE) e mescla por `id` antes de retornar `{ eventos }`. Padrão reutilizável para qualquer rota que precise de colunas fora do schema Drizzle.

## extract-openai.ts

Usa **fetch nativo** (sem instalar `openai` SDK) com `AI_INTEGRATIONS_OPENAI_API_KEY` (ou `OPENAI_API_KEY` como fallback). Retorna `null` se sem chave — comportamento lazy idêntico ao `extract-anthropic.ts`.
