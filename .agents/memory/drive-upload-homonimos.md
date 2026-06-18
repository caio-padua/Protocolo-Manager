---
name: Drive uploadFileToDrive apaga homonimos
description: uploadFileToDrive deleta arquivos de mesmo nome por padrao; arquivos que devem coexistir precisam de nome unico + allowDuplicates=true.
---

# uploadFileToDrive apaga homonimos (perda de dado silenciosa)

`uploadFileToDrive(folderId, fileName, mime, buf, allowDuplicates=false)` por padrao
LISTA e APAGA todo arquivo de mesmo nome na pasta antes de subir. Esse default e
idempotente de proposito (pastas, planilhas, PDF unico por cliente) e nao deve mudar.

**Risco:** se dois uploads distintos geram o MESMO nome (ex.: receitas do mesmo
cliente/tipo/dia), o segundo DESTROI o primeiro no Drive — perda de dado em
producao, sem erro.

**Regra:** todo tipo de arquivo que deva COEXISTIR precisa de (1) nome globalmente
unico — incluir o id do registro, ex.: "#${recipe.id}" — e (2) allowDuplicates=true.
Para ter o id no nome, inserir o registro no banco PRIMEIRO (insert ... returning),
montar o nome com o id, subir, e so entao gravar fileName/driveFileId de volta num
update best-effort (try/catch + log).

**Why:** um review reprovou a emissao de receitas por sobrescrita no Drive (nome
nao-unico + delete de homonimo).

**How to apply:** ao wirar QUALQUER novo upload pelo helper, decidir explicitamente
se o arquivo e singular (mantem default false) ou colecionavel (nome unico + true).
