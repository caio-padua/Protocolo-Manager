---
name: Fila persistente PostgreSQL e medicações do cliente
description: decisões da fila mensagens_fila (PDF de exame) e de cliente_medicacoes com consentimento por clínica
---
Fila: reserva exclusiva, lease maior que o prazo do item, conclusão guardada por worker+nº da tentativa, TTL nunca entrega, job do worker desligado por PADAXOR_FILA_PDF_ATIVA.
**Why:** evitar reentrega de item ainda rodando e envio duplicado.
**How to apply:** vigia do Drive e importação manual ainda NÃO usam a fila (decisão pendente do Dr. Caio).
Medicações: autodeclarada nasce sem validação (servidor ignora estado enviado); só validada + consentimento ativo da clínica entra no lembrete; dose não estruturada bloqueia envio; sincronizarLembretePrescricao SUBSTITUI períodos, então sempre receber lista completa (prescrição + medicações).
Testes: ~14 falhas antigas em cockpit/prescrições/protocol-drive-email por mocks defasados (confirmado: mesmas falhas com arquivos originais).
