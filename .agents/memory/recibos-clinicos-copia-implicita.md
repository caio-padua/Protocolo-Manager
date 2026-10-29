---
name: Destinatários implícitos em documentos clínicos
description: Risco de cópias pessoais herdadas quando a emissão passa a aceitar mais médicos e clínicas.
---

**Regra:** Nenhum motor de documento clínico pode ter como destinatário padrão o e-mail pessoal de um médico ou do proprietário. A identidade do emissor e do cliente deve ser validada antes de selecionar destinatários, e envios devem ser revisados por canal.

**Why:** Um padrão que parecia uma cópia interna em um fluxo de médico único torna-se um vazamento entre clínicas quando a emissão passa a reconhecer vários médicos. Remover o destinatário do chamador não basta se o motor reintroduz o mesmo padrão quando nenhum destinatário é passado.

**How to apply:** Ao ampliar rotas de emissão ou reenvio, inspecionar tanto o destinatário passado pelo controlador quanto o valor padrão no motor; validar autorização clínica antes de gerar, assinar, subir arquivos ou enviar mensagens. Não assumir que proteger o botão na interface protege a rota acessível diretamente.
