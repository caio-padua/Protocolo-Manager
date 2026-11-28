---
name: Testes de autorização antigos x tenantContext
description: 30 falhas de teste vieram de mocks defasados após a refatoração de 31/10/2026, não do código novo
---

Rotas protegidas leem profissional, vínculos e empresa no banco e conferem `credentialVersion`; mocks que simulavam só a tabela de clientes passaram a dar 500. Provado por linha de base (commits antes/depois).

**Why:** evitar chamar falha de "preexistente" sem prova, e evitar afrouxar autenticação para fazer teste passar.
**How to apply:** ajuste o mock ao contrato atual; resolver de clínica deve conferir `credential_version` (achado real corrigido em onboarding-clinic).
