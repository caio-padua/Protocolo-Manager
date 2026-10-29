---
name: Git — autenticação gerenciada e sincronização
description: Usar primeiro o transporte gerenciado do Replit e verificar leitura e escrita separadamente, sem manipular tokens.
---

Priorizar o transporte de Git já configurado pelo Replit, sem ler, imprimir ou injetar credenciais pessoais.

**Why:** Houve falhas históricas de autenticação pessoal, mas em 29/10/2026 o transporte gerenciado por `github.replit.internal` permitiu buscar e enviar alterações normalmente, sem acessar segredos.
A afirmação antiga de que só o painel visual permite envio deixou de corresponder ao ambiente observado.
Leitura de um repositório público, sozinha, nunca comprova autorização de escrita.

**How to apply:** Verificar árvore de trabalho e divergência antes de sincronizar.
Usar apenas envio normal autorizado, sem forçar ou reescrever o histórico.
Se a ferramenta pedir uma autorização adicional para modificar os metadados de Git, seguir a instrução explícita da ferramenta somente dentro do escopo autorizado pelo usuário.
Comparar o identificador local com o ramo remoto depois do envio.
Se houver falha de autenticação, consultar as instruções de integrações para reconectar o acesso gerenciado; não repetir variantes de cabeçalhos nem acessar tokens manualmente.
