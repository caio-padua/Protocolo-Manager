---
name: Drive watcher — cópia vai para pasta pessoal do paciente
description: Ordem correta de ensureClientFolderStructure x driveCopyFileInFolder no watcher de exames.
---

## Regra

`ensureClientFolderStructure(clientId)` DEVE ser chamado ANTES de `driveCopyFileInFolder`.
O destino primário da cópia canônica é a pasta `EXAMES` pessoal do paciente no Google Drive.
A pasta vigiada de sandbox (`EXAMES PACIENTES SANGUE` etc.) é apenas fallback de auditoria.

**Por quê:** A versão antiga copiava primeiro para `folder.id` (pasta vigiada), e só depois tentava upload ao Drive do paciente via `uploadFileToDrive`. O CEO via o arquivo na pasta de sandbox mas nunca na pasta pessoal.

**Como aplicar:**
1. Resolver `clientExamesFolderId = structure.exames | structure.imagens` antes do step de cópia.
2. `copyDestFolder = clientExamesFolderId ?? folder.id` — clientExamesFolderId quando existir, fallback para folder.id.
3. Documentos antigos (processados antes do fix) têm `copiedName=None` — não é erro, é histórico.

## Campos relevantes no banco

- `drive_watcher_files.copiedDriveId` — ID do arquivo no Drive do paciente (ou sandbox se fallback)
- `drive_watcher_files.copiedName` — nome canônico da cópia
- `exam_documents.sourcePdfDriveId` — arquivo ORIGINAL na pasta vigiada (não tocar)
