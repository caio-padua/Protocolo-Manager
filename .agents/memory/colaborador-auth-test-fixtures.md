---
name: Fixtures de autenticação do colaborador
description: Como manter testes clínicos fiéis ao login de colaborador e às verificações repetidas de rota.
---

Dados sintéticos de rotas protegidas precisam representar a sessão autenticada completa: colaborador ativo, papel e versão de credencial compatível com o token. Se o roteador e a rota aplicarem a proteção separadamente, o teste deve fornecer o resultado para cada validação.

**Why:** fixtures antigas simulavam apenas a identidade clínica; após a sessão passar a ser revalidada no banco, as requisições pararam na autenticação antes de exercitar a autorização clínica.

**How to apply:** preservar as proteções reais nos testes, ajustar a fila de consultas sintéticas na ordem efetiva e manter casos de acesso permitido e negado; nunca remover a autenticação para fazer o teste passar.
