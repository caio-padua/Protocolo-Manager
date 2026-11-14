---
name: Publicação do Manager indisponível
description: diagnóstico do endereço publicado retornando 404 e correção preparada (peso do pacote)
---
Estado em 14/11/2026: getDeploymentInfo mostra isDeployed=true, hasSuccessfulBuild=false, e fetchDeploymentLogs não acha nenhum log; o endereço responde 404 na borda. Os builds de produção de api-server, padcom, parxis-site e vitrine-demo passam localmente.
Hipótese mais forte (não provada): pacote pesado — attached_assets 1,3 GB e .cache 1,6 GB entravam na publicação porque .replitignore só excluía .local e generated-artifacts. Correção preparada: ambos adicionados ao .replitignore (nenhum código publicado lê esses arquivos). Falta publicar com o comando do CEO e ler o resultado.
**Why:** sem log de execução, só o build/empacotamento pode ter falhado.
**How to apply:** ao republicar, conferir hasSuccessfulBuild e só então culpar código.
