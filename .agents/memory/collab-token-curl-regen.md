---
name: Autenticação operacional em testes
description: Preservar o login real nos testes protegidos sem fabricar credenciais ou sessões
---

Testes operacionais autenticados devem usar uma sessão obtida pelo login normal.
Não fabricar tokens, alterar credenciais ou desativar a autenticação para desbloquear um teste.

**Why:** um token fabricado contorna parte da jornada de acesso e pode esconder falhas de sessão, permissões e clínica.

**How to apply:** usar credenciais operacionais já autorizadas apenas no fluxo normal, sem exibir seus valores.
Manter a sessão obtida em memória durante a verificação e nunca gravar tokens em evidências, repositório ou relatórios.
Se o login for recusado, registrar a causa sem contornar a segurança.
