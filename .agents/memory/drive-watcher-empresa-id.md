---
name: Drive watcher — empresa_id e sourcePdfDriveId obrigatórios
description: Bug crítico no watcher: documentos criados sem empresa_id (filtro de tenant excluía tudo) e sem sourcePdfDriveId (botão Abrir no Drive quebrado).
---

## O bug

O `processWatchedFolders` em `lib/drive-watcher.ts` criava documentos em `exam_documents`
sem preencher `empresa_id` nem `sourcePdfDriveId`. Resultado:

- `GET /api/exames-lab/documentos?clientId=X` usa `WHERE empresa_id = resolveEmpresaId(req)` — como a coluna era NULL, NENHUM documento do watcher aparecia na tela.
- `sourcePdfDriveId = null` → botão "Abrir no Drive" ficava desabilitado.

## A correção

Nos dois ramos do insert (sangue + imagem):
```ts
empresaId: 5,           // fixo enquanto single-tenant
sourcePdfDriveId: file.id,   // ID do arquivo na pasta monitorada
sourcePath: file.name,       // nome original (para detectar renomeação)
```

## Backfill

```sql
UPDATE exam_documents SET empresa_id = 5 WHERE empresa_id IS NULL;
```
(rodou em 23/07/2026 — corrigiu docs 616 e 617)

**Why:** o watcher é um worker de background sem req/res — não tem `resolveEmpresaId()` disponível. Deve usar `empresaId: 5` fixo (single-tenant) até haver multi-tenant real.

**How to apply:** sempre que um novo insert em `exam_documents` vier de um contexto sem request HTTP (workers, crons), incluir `empresaId` explicitamente.
