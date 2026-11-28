---
name: Código de Renomeação de Exames
description: Nome oficial aprovado pelo CEO para a regra única de nomear arquivos de exame no Drive; estado da decisão e inconsistências conhecidas.
---

Nome oficial (aprovado pelo CEO): **"Código de Renomeação de Exames"** (não "Código do Arquivo Paxter").

Formato aprovado para execução: `AA.MM.DD TIPO [REGIÃO E LADO] NOME DO CLIENTE.ext`; maiúsculas, sem acentos, palavras separadas por espaços; prefixo de data existente preservado.

O CEO determinou `LABOR` para exame de sangue/laboratorial. Preservar `USG`, `RMN`, `TC` e `RX`. Cintilografia usa o nome reconhecível por extenso (por exemplo, `CINTILOGRAFIA MIOCARDICA` e `CINTILOGRAFIA RENAL ESTATICA`), sem inventar sigla.

**Why:** o catálogo atual tem exames sem sigla curta canônica e a nomenclatura precisa continuar compreensível; arquivos de nomes iguais não podem apagar documentos anteriores.

**How to apply:** aplicar a regra em um único construtor compartilhado por upload do portal, varredura automática e renomeador manual; nomes repetidos recebem sufixo numérico e os arquivos existentes nunca são apagados. Não executar renomeação em massa sem ordem separada.
