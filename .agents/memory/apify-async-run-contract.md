---
name: Apify — contrato REST assíncrono (run/poll/dataset)
description: Como disparar e acompanhar um actor do Apify via REST sem bloquear a requisição; forma de resposta varia por endpoint.
---

# Apify — disparar assíncrono, nunca o endpoint síncrono

Actors do Apify rodam por dezenas de segundos a minutos. O endpoint síncrono
(`run-sync`) pode bloquear até 300s — passa do teto prático de uma rota HTTP
comum neste projeto (~120s). Usar sempre o fluxo assíncrono:

1. `POST /v2/acts/{actorId}/runs?token=...` → inicia, devolve `runId` + `defaultDatasetId` já na criação.
2. `GET /v2/actor-runs/{runId}?token=...` → poll de status (`READY|RUNNING|SUCCEEDED|FAILED|ABORTED|TIMED-OUT`).
3. `GET /v2/datasets/{datasetId}/items?token=...` → resultado final.

**Why:** sem worker/cron dedicado neste projeto ainda, o padrão adotado foi
"lazy poll" — quem chama `GET /pesquisas/:id` empurra a máquina de estados
adiante (só consulta o Apify se a pesquisa ainda estiver `em_andamento`), sem
precisar de infraestrutura de fila dedicada.

**Pegadinha de formato:** `/runs` e `/actor-runs/{id}` embrulham a resposta em
`{ data: {...} }`; `/datasets/{id}/items` NÃO embrulha — devolve o array JSON
puro direto no body. Tratar os dois formatos como diferentes é obrigatório, ou
o parse quebra silenciosamente num dos três.

Ref.: `artifacts/api-server/src/lib/apify.ts` (Central de Pesquisa, Task 235).
