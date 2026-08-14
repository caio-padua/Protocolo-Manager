---
name: Google Sheets — :append desloca colunas
description: Por que nunca usar values:append para acrescentar linha na PLANILHA PRODUCAO, e o que usar no lugar.
---

# O :append do Google Sheets escolhe a coluna sozinho

Pedir `values/A:J:append` **não garante** que a linha caia em A:J. O Google procura a
"tabela" que intersecta a faixa e ancora na **primeira coluna dessa tabela detectada**.
Uma única célula solta fora da coluna A (a PLANILHA PRODUCAO tem uma, "AGUARDANDO" em F88,
escrita à mão pelo CEO) faz a detecção começar em F — e a linha inteira sai deslocada
para F:O, com o número do item na coluna F e o módulo na coluna O.

O pior: a chamada devolve **HTTP 200** e um `updatedRange` de aparência saudável
(`'PLANILHA PRODUCAO'!F89:O90`). Só lendo o `updatedRange` letra por letra, ou relendo a
planilha, é que o erro aparece.

**Regra:** para acrescentar linha, calcular a primeira linha livre e escrever em faixa
explícita com `PUT ...?valueInputOption=USER_ENTERED`. Nunca `:append`.

```
ultimaOcupada = maior índice de linha com QUALQUER célula preenchida na faixa lida
destino       = A{ultimaOcupada+1}:J{ultimaOcupada+n}
```

**Why:** em 14/08/2026 dois itens novos foram parar em F89:O90. Não houve perda de dado
(as células estavam vazias), mas só por sorte: se a última linha de dados fosse a 89 em
vez da 85, o append teria sobrescrito as colunas F-J de um item real do CEO.

**How to apply:** vale para qualquer escrita em planilha do projeto. A ferramenta pronta
é `scripts/planilha-adicionar-item.mjs` — ela já faz o cálculo de linha livre, exige as
colunas I ("Para que serve") e J ("Módulo") do `docs/PROTOCOLO-PLANILHA.md`, relê a
planilha para conferir e avisa o `#padaxor-projeto`. Preferir ela a escrever à mão.

## Credencial

Sheets **não tem conector próprio** neste projeto. O token sai do conector `google-drive`
(mesmo caminho que `lib/google-drive.ts` usa: `REPLIT_CONNECTORS_HOSTNAME` +
`REPL_IDENTITY`). No sandbox de CodeExecution, `listConnections("google-drive").proxyFetch`
**não** alcança a API do Sheets — a base do proxy é a do Drive. Por isso a ferramenta é um
script Node que pega o access token e chama `sheets.googleapis.com` direto.
