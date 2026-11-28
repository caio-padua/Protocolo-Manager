---
name: Transmutação e origem privada do catálogo
description: Uma origem inacessível por endereço público pode existir em repositório privado conectado.
---

A exportação de catálogo pode estar em repositório privado; uma resposta 404 no
endereço público não demonstra que o arquivo não existe.

**Why:** A leitura anônima de um repositório privado pode falhar mesmo quando
a integração autenticada possui acesso.

**How to apply:** Verificar a origem com a integração existente e não expor
credenciais. Antes de alterar o carregamento da transmutação, avaliar que o
mesmo processo também pode importar cadastros de clientes.
