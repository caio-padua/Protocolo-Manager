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
Para assinatura digital, o CPF de onze dígitos e o CRM com unidade federativa
devem estar no cadastro do profissional autenticado; nunca usar o CPF do cliente
como substituto. Se faltar um dado, a mensagem deve identificar o campo e indicar
o caminho de atualização em Meu Acesso.

**Why:** Uma prescrição sem vínculo deixa de alimentar o lembrete automático,
mas um vínculo inferido incorretamente encaminha tratamento à pessoa errada.
Além disso, exibir o CRM na tela não prova que o CPF do médico esteja cadastrado
na fonte usada pelo assinador.

**How to apply:** Na emissão e em qualquer reparo histórico, restringir a empresa,
normalizar identificadores, usar somente a identidade autenticada do médico e
preservar casos ambíguos sem disparar mensagens.
