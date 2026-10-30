---
name: Destinatários implícitos em documentos clínicos
description: Risco de cópias pessoais herdadas quando a emissão passa a aceitar mais médicos e clínicas.
---

**Regra:** Nenhum motor de documento clínico pode ter como destinatário padrão o e-mail pessoal de um médico ou do proprietário. A identidade do emissor e do cliente deve ser validada antes de selecionar destinatários, e envios devem ser revisados por canal.

**Why:** Um padrão que parecia uma cópia interna em um fluxo de médico único torna-se um vazamento entre clínicas quando a emissão passa a reconhecer vários médicos. Remover o destinatário do chamador não basta se o motor reintroduz o mesmo padrão quando nenhum destinatário é passado.

**How to apply:** Ao ampliar rotas de emissão ou reenvio, inspecionar tanto o destinatário passado pelo controlador quanto o valor padrão no motor; validar autorização clínica antes de gerar, assinar, subir arquivos ou enviar mensagens. Não assumir que proteger o botão na interface protege a rota acessível diretamente.

**Regra de autorização:** Emissão clínica não autoriza entrega. Envios únicos exigem confirmação de canal e contato atual; lembretes recorrentes exigem autorização específica do telefone e da clínica. Sincronizar conteúdo não pode ligar a agenda.

**Why:** O pedido de separar geração e envio também abrange saídas indiretas: lotes noturnos, espelhos entre canais, compartilhamento com farmácia e áudio adicional. Confirmar WhatsApp não autoriza Telegram.

**Regra de preservação:** Sincronizar conteúdo não deve revogar uma agenda já ligada com autorização ainda válida para telefone e clínica. Também não deve apagar alertas regulatórios internos ao remover comunicações externas.

**Why:** Desligar indiscriminadamente uma agenda autorizada interrompe tratamento sem decisão humana; retirar e-mails de alerta SNCR não justifica perder os cartões urgentes internos.

**How to apply:** Seguir a cadeia completa até o provedor, incluindo espelhamentos e ações de finalizar consulta. Aceitação, simulação, link manual e entrega efetiva são resultados distintos; nunca exibir sucesso para uma simulação ou recusa. A tentativa auditada precisa referenciar o registro do provedor e acompanhar seu resultado posterior, pois aceitação inicial pode terminar em recusa.
