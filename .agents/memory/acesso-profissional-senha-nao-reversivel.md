---
name: Senha profissional não exibível
description: Regra para telas de identidade e credenciais do colaborador.
---

A tela de conta do profissional pode mostrar o usuário de acesso e se há senha cadastrada, mas nunca a senha original nem seu registro criptográfico irreversível. Qualquer redefinição precisa ser uma jornada separada, autenticada e autorizada; o profissional-alvo nunca deve ser escolhido por um identificador enviado pelo navegador.

**Why:** As senhas são armazenadas com scrypt e salt, portanto não podem ser recuperadas em texto. Exibir ou transportar o registro de verificação criaria risco sem permitir recuperar a senha.

**How to apply:** Em telas de conta, derivar apenas um indicador booleano no servidor e restringir a consulta à identidade da sessão. Antes de criar alteração ou recuperação, definir reautenticação, autorização e invalidação das sessões antigas.
