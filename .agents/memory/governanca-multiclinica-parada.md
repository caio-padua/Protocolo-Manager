---
name: Governanca/multi-clinica parada (braco pendente)
description: Decisao do CEO de PARAR o braco multi-clinica/centro de comando para nao derivar do foco de operacionalizar o reagendamento.
---

# Braco multi-clinica / governanca: PARADO de proposito

Decisao do CEO Dr. Caio em 20/06/2026: o escopo grande (SaaS multi-clinicas, Centro de Comando,
Area do Colaborador com RBAC por papel+escopo, validacao opcional de agendamento) esta GUARDADO
como spec mas NAO deve ser construido agora.

**Onde mora o escopo:** `specs/governanca-multiclinica-PENDENTE.md` (semente; retomar so por ordem
expressa do CEO). Referencia visual: Canvas ENTREGA 7 (selo "7").

**Why:** construir esse braco agora desviaria do foco combinado — operacionalizar AINDA HOJE o
auto-reagendamento da cliente (`specs/auto-reagendamento-cliente.md`). O CEO priorizou entregar o
operacional antes de abrir a frente arquitetural.

**How to apply:** se uma sessao futura cogitar implementar org layer / RBAC por escopo / centro de
comando / validacao por funcionario, confirmar com o CEO ANTES — esta pausado, nao esquecido. A
arquitetura escolhida (camada Organizacao acima de `locations`, isolamento por `organization_id`,
RBAC = pessoa+papel+escopo, app unico de colaborador) ja esta decidida; nao re-litigar do zero.
