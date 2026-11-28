---
name: Envio clínico com resultado incerto
description: Decisão de segurança para idempotência durável e interpretação de falhas na comunicação com provedores.
---

Pedidos de exames já reservados não devem expirar nem ser retomados automaticamente, mesmo que o processo morra. Uma resposta perdida pode esconder uma mensagem já aceita pelo provedor. Consultar o resultado anterior não é autorização para novo envio.

**Why:** o requisito de segurança inclui repetição em duas janelas e comunicação interrompida; liberar a reserva por prazo transforma uma indisponibilidade em mensagem clínica duplicada. Uma nova chave aleatória também não deve contornar a proteção do mesmo conjunto autorizado de documentos e canais.

**How to apply:** novas opções de reenvio ou reconciliação devem exigir conferência explícita e preservar o histórico; não acrescentar limpeza por prazo, retomada automática ou liberação de operação incerta como otimização. Não confundir aceite do provedor com entrega confirmada.

Reservas antigas sem identificação do paciente só podem ser exibidas quando houver auditoria que comprove o mesmo escopo clínico. Não tentar inverter o hash nem presumir que uma reserva sem auditoria pertence ao paciente aberto.

**Why:** a interrupção pode ocorrer antes da primeira auditoria; metadados ausentes não são prova de ausência de envio nem autorização para compartilhar a operação.

**How to apply:** ao evoluir a recuperação de operações antigas, exigir vínculo comprovável com paciente, médico, empresa e clínica; ausência de vínculo deve permanecer explícita, nunca resolvida por suposição.

Na recuperação concorrente, decisões sobre recibos e efeitos já aceitos devem usar o estado devolvido pela reserva atômica, nunca o lote selecionado antes dela. A finalização também precisa serializar a alteração principal antes das gravações dependentes.

**Why:** outro executor pode persistir um recibo entre a seleção e a reserva; um lote antigo ainda parecerá sem envelope e poderá duplicar o envio, mesmo com reserva durável.

**How to apply:** devolver os metadados atuais ao reservar e testar explicitamente a transição de “sem recibo” para “recibo persistido” com uma seleção defasada; testar apenas a janela em processamento não cobre essa corrida.
