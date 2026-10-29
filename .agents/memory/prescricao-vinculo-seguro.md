---
name: Prescrição — vínculo seguro
description: Critério de segurança para recuperar pacientes de prescrições históricas.
---

Não inferir paciente pelo nome nem escolher o primeiro resultado de CPF/e-mail.
Identificadores que encontram pessoas distintas exigem seleção humana; CPF
divergente impede resgate apenas por e-mail, mesmo quando esse e-mail é único.
Na emissão e no reenvio, um ID válido não basta: os contatos fornecidos devem
corresponder ao cadastro, para não vincular a uma pessoa e entregar a outra.
Contato novo precisa ser atualizado no cadastro antes da emissão.

**Why:** Uma prescrição sem vínculo deixa de alimentar o lembrete automático,
mas um vínculo inferido incorretamente encaminha tratamento à pessoa errada.

**How to apply:** Na emissão e em qualquer reparo histórico, restringir a empresa,
normalizar identificadores e preservar casos ambíguos sem disparar mensagens.
