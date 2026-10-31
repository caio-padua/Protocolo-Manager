---
name: Transicao de login por e-mail ou CPF
description: Regra aprovada para migrar login de colaborador sem bloquear contas existentes.
---

# Transicao de login

Manter o login atual de uma conta enquanto os campos de e-mail e CPF estiverem vazios. Depois que o cadastro canonico receber um identificador, a entrada por senha deve aceitar e-mail ou CPF normalizado e deixar de aceitar o identificador antigo para aquela conta.

**Why:** a conferência agregada do banco de desenvolvimento mostrou contas com senha sem e-mail nem CPF; uma troca imediata bloquearia o acesso, e identificadores não podem ser inventados.

**How to apply:** antes de habilitar a regra em cada ambiente, conferir apenas completude, normalização e unicidade dos identificadores. Nunca registrar senha, e-mail ou CPF em claro na auditoria.
