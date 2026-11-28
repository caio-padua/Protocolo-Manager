---
name: Trava de tarefas — falha só alerta, nunca apaga carimbo
description: Decisão do Dr. Caio (28/11/2026) sobre falha de tarefa após reserva na exclusividade de tarefas.
---
Decisão (opção C): manter a trava de exclusividade e registrar/alertar quando uma tarefa falha, com tarefa, janela, horário e motivo sem dado sensível.
NUNCA apagar o carimbo automaticamente e NUNCA reenviar mensagens por conta da falha.

**Why:** a falha pode ocorrer depois do envio real; repetir geraria duplicação ao cliente. Impedir duplicação vale mais que entrega imediata; a retomada acontece só pelo vencimento natural da janela.

**How to apply:** qualquer mudança em exclusividade-tarefas deve preservar: carimbo gravado antes de executar, janela como único gatilho de retomada, registro de falha sem corpo de mensagem, telefone, e-mail ou nome de cliente. Proposta técnica apresentada em 28/11/2026; implementação aguarda autorização escrita.
