---
name: Solicitação de acesso com aprovação da clínica
description: Regra de entrada para profissionais ainda sem conta no sistema clínico.
---

Novos profissionais não recebem acesso automaticamente ao solicitar cadastro. A solicitação deve permanecer pendente até aprovação explícita da clínica responsável.

**Why:** o acesso imediato permitiria que uma pessoa não autorizada entrasse em dados e ferramentas clínicas.

**How to apply:** qualquer fluxo público de entrada deve criar somente uma solicitação pendente, sem sessão ou permissões. A aprovação deve ser feita por uma pessoa autorizada da clínica e vinculada à clínica correta antes de habilitar a conta.
