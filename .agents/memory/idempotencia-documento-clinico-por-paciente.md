---
name: Idempotencia de documento clinico e por paciente
description: Dedup de arquivo clinico por hash global mistura pacientes; e consumo clinico exige gate de conferencia.
---

Regra 1: deduplicar arquivo clinico (laudo, exame) por hash GLOBAL e errado — o mesmo PDF enviado para outro cliente reutilizaria o documento do primeiro, misturando prontuarios. A chave de idempotencia e sempre composta: (cliente, hash).

Regra 2: endpoint de consumo clinico (evolucao, comparativo, motor) so pode ler resultados de documentos ja CONFERIDOS por humano; dado recem-extraido pela IA nao e verdade clinica.

**Why:** reprovacao do architect na onda da trajetoria de exames (10/07/2026): dedup global = risco de isolamento de dados; evolucao lia resultados nao conferidos.

**How to apply:** ao criar qualquer tabela de documento por cliente com hash de arquivo, usar indice unico composto (client_id, hash) e filtrar status de validacao humana em toda leitura clinica.
