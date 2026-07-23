---
name: Drive watcher — re-processar arquivo já rastreado
description: Como forçar o watcher a processar um arquivo que já está na tabela drive_watcher_files
---

## Regra

`getProcessedFileIds()` retorna o conjunto de TODOS os `file_id` presentes na tabela `drive_watcher_files`, independente do valor da coluna `status`. O watcher pula qualquer arquivo cujo id já esteja nesse conjunto.

**Por isso:**
- Mudar `status='pendente'` NÃO força reprocessamento — o arquivo ainda está no conjunto.
- A única forma de re-processar é `DELETE FROM drive_watcher_files WHERE file_id = '...'` e rodar o watcher de novo.

**Why:** A checagem é por presença no SET (lookup O(1)), não por status. Isso evita reprocessamento acidental em caso de falha parcial, mas impede re-runs manuais sem limpeza.

**How to apply:** Ao depurar o watcher (novo step de cópia Drive, novo prompt Gemini, etc.), apagar as linhas relevantes e rodar `/api/drive-watcher/process` com token de colaborador.
