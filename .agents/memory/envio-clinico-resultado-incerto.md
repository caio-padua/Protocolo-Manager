---
name: Envio clínico com resultado incerto
description: Decisão de segurança para idempotência durável e interpretação de falhas na comunicação com provedores.
---

Pedidos de exames já reservados não devem expirar nem ser retomados automaticamente, mesmo que o processo morra. Uma resposta perdida pode esconder uma mensagem já aceita pelo provedor. Consultar o resultado anterior não é autorização para novo envio.

**Why:** o requisito de segurança inclui repetição em duas janelas e comunicação interrompida; liberar a reserva por prazo transforma uma indisponibilidade em mensagem clínica duplicada. Uma nova chave aleatória também não deve contornar a proteção do mesmo conjunto autorizado de documentos e canais.

**How to apply:** novas opções de reenvio ou reconciliação devem exigir conferência explícita e preservar o histórico; não acrescentar limpeza por prazo, retomada automática ou liberação de operação incerta como otimização. Não confundir aceite do provedor com entrega confirmada.
