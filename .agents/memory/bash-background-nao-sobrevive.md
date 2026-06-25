---
name: Processos em segundo plano não sobrevivem entre chamadas de bash
description: A ferramenta de shell encerra o grupo de processos ao retornar; nohup/& não persistem.
---

# Background process morre entre tool calls de bash

A ferramenta `bash` encerra o grupo de processos quando o comando retorna. Lançar com `&` + `nohup`
e tentar ler o resultado numa CHAMADA SEGUINTE **não funciona**: o processo é morto e o log fica vazio.

**Como aplicar:** qualquer trabalho que precise de resultado tem de terminar DENTRO de uma única
chamada de bash (teto ~120s da ferramenta). Para algo mais longo, use um **workflow** de verdade
(serviço gerenciado pelo Replit) ou uma fila/job persistente — não dependa de `nohup ... &` entre turnos.

Sintoma de diagnóstico: `pgrep` não acha o processo e o arquivo de log redirecionado está vazio logo
após o "lançamento".

Bônus: `console.error(objetoDeErro)` pode quebrar com `Cannot read properties of undefined (reading 'value')`
dentro de `node:internal/util/inspect` quando o objeto (ex.: erro do SDK Google GenAI) tem descritores
de propriedade atípicos. Logue `err.message` / `err.stack` como STRING, nunca o objeto cru.
