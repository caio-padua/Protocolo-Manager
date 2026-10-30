---
name: Autorização na fronteira de envio
description: Limite da exceção de segurança e cuidado com testes que substituem o contexto autenticado.
---

# Autorização na fronteira de envio

Não tratar um contexto de clínica injetado pelo teste como prova de isolamento na aplicação real.
Testes de envio precisam conservar a cadeia real de autenticação e de contexto, inclusive privilégios legados,
substituindo os provedores externos para não contatar clientes.

**Why:** o filtro de cliente funcionava com empresa simulada, mas o contexto real concedia empresa padrão e
privilégio de proprietário a qualquer colaborador autenticado; testar só o filtro ocultava o problema anterior.

**How to apply:** ao validar segurança de mensagens, conferir a origem da autorização antes do filtro
e garantir ausência de efeitos colaterais no caminho recusado.

Associações administrativas explícitas não devem ser inferidas de nome, cargo ou local de agenda.
Não conceder permissões automaticamente a todos os colaboradores antigos para preservar compatibilidade.

**Why:** vínculos operacionais editáveis pelo navegador não são, por si, concessões administrativas de acesso.

**How to apply:** ausência de autorização confiável bloqueia o envio; informar a necessidade de cadastro
administrativo e manter licenciamento e cobranças fora desta correção restrita.
