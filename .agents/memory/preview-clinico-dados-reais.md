---
name: Preview clínico e dados reais
description: Evitar que a verificação visual de telas clínicas carregue registros reais.
---

Não use captura de preview de rotas clínicas do Manager para validar interface até haver um ambiente comprovadamente sintético e isolado. Uma captura de rota de exames exibiu registros existentes mesmo sem uma sessão autenticada iniciada pela ferramenta de captura.

**Why:** A verificação visual pode carregar dados clínicos reais antes que o agente perceba que a rota está autenticada ou que o ambiente de preview usa dados persistentes.

**How to apply:** Para telas clínicas, validar com fixtures sintéticas em ambiente isolado. Se a captura apresentar qualquer registro real, parar, remover a cópia temporária e não consultar detalhes.
