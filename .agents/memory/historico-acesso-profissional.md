---
name: Historico de alteracoes de acesso
description: Regra de privacidade para o historico da conta profissional.
---

O historico proprio pode mostrar os valores anteriores e novos de campos profissionais comuns, mas nunca deve conter senha, hash, token, codigo de recuperacao ou identificador completo de acesso.

CPF e e-mail devem permanecer protegidos no historico, mesmo quando o profissional consegue ver esses dados em sua ficha autenticada. A leitura do historico e limitada a identidade da sessao atual. A interface nao oferece exclusao dos eventos.

**Why:** O CEO escolheu visualizar valores anteriores para reconhecer alteracoes, sem transformar o historico em fonte de credenciais ou em caminho para acessar dados de outra pessoa.

**How to apply:** Aplicar em qualquer tela de conta profissional, trilha de auditoria pessoal ou recuperacao de credenciais; manter uma lista permitida de campos e mascarar identificadores antes de apresentar ou registrar.
