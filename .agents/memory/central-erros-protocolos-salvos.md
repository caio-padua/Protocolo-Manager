---
name: Central de Erros e protocolos de prescrição salvos
description: decisões de design da tela de erros do CEO e dos protocolos (conjuntos de fórmulas) salvos por médico
---

# Central de Erros (CEO) e protocolos salvos por médico

- Erros 5xx são gravados em `system_error_log` por middleware que embrulha `res.json`; rota que já registrou com
  detalhe marca `res.locals.erroRegistrado` para não duplicar. Nunca grava corpo nem query; segmentos longos viram `:token`.
- Tela `/cadastros/central-erros`, só dono da plataforma; atualiza por consulta a cada 5 s (não é streaming).
- Protocolo de prescrição = conjunto de fórmulas reutilizável (NÃO é a prescrição emitida, nem o menu Protocolos injetáveis).
  Salvo em `prescription_protocols` POR MÉDICO (dono vem do token); remover = `ativo=false`, linha permanece.

**Why:** CEO pediu tela de erros porque o 500 genérico escondia o motivo; protocolo salvo só em memória sumia ao recarregar.
Regra de Ouro proíbe apagar linhas.

**How to apply:** nova rota que captura exceção com detalhe deve chamar `registrarErroSistema` e marcar `erroRegistrado`.
Para testar rota do CEO por curl: token do profissional dono (is_platform_owner) exige `credentialVersion` real do banco.
