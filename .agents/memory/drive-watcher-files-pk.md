---
name: drive_watcher_files — PK é file_id (sem coluna id)
description: Armadilha de schema na tabela drive_watcher_files e bug de assinatura em ensureClientFolderStructure.
---

## Regras

1. `drive_watcher_files` usa `file_id TEXT` como PRIMARY KEY — NÃO tem coluna `id`.
   - `SELECT id ...` → erro de coluna inexistente
   - `UPDATE ... WHERE file_id = ...` (nunca WHERE id)

2. `ensureClientFolderStructure` em `google-drive.ts` exige `(clientName: string, cpf: string)`.
   - Passar `clientId` (number) como primeiro argumento cria estrutura com nome numérico → não encontra a pasta → clone nunca vai para o paciente.
   - Sempre buscar `name` e `cpf` do cliente no banco ANTES de chamar a função.

3. Subpastas corretas para exames: `subs["EXAMES"]` (sangue) e `subs["IMAGENS"]` (imagem).
   - As chaves são UPPERCASE exatamente como definidas em `CLIENT_SUBFOLDERS`.

**Por quê:** Bug silencioso — a assinatura errada passava `clientId` como `clientName`, criava/encontrava uma pasta chamada "5278" no Drive (nunca a pasta real do paciente), e `copiedDriveId` ficava null no banco. O CEO via "Clone no Drive: Não gerado" em TODOS os arquivos.

**Como aplicar:**
```typescript
// CORRETO
const [clientRow] = await db
  .select({ name: clientsTable.name, cpf: clientsTable.cpf })
  .from(clientsTable)
  .where(eq(clientsTable.id, clientId))
  .limit(1);
const structure = await ensureClientFolderStructure(clientRow.name, clientRow.cpf ?? "");
const examesFolderId = structure.subfolders["EXAMES"]; // sangue
```
