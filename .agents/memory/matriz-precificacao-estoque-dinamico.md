---
name: Matriz única + precificação + estoque estático/dinâmico
description: Decisões duráveis da tela Matriz de Fornecedores integrada a Orçamento, Substâncias e estoque reservado por protocolo.
---
Estoque: físico = soma dos lotes; dinâmico = reservado − consumido − liberado; estático (livre) = físico − dinâmico (negativo = falta). Reserva nasce quando o protocolo vira validated; cada aplicação com OK baixa 1 unidade (lote que vence primeiro, idempotente). Não aplicada (missed) não consome. Liberação é ação humana.

**Why:** o Dr. Caio pediu que 10 sessões confirmadas tirem 10 ampolas do estático e baixem do dinâmico a cada aplicação.
**How to apply:** ganchos de reserva/baixa rodam em savepoint e nunca revertem agenda/aplicação (falha só vai ao log; aplicação sem lote vira pendência "sem lote"). Protocolos já validados antes não têm reserva retroativa.

Preço: referência = maior valor (configurável); margem sobre a venda; percentuais começam em 0 ("0 = não preenchido"). O cálculo autoritativo é do servidor; a tela só simula o "seria". Preço publicado só vai ao Orçamento e a substances.price_per_unit quando a substância tem 1 apresentação e 1 item ativo no catálogo; todo caso gera histórico; congelar fotografa antes de mudar.

**Why:** destino ambíguo corromperia preços de outra apresentação.
**How to apply:** nunca alterar preço de substância fora da publicação da matriz. Tela usa fetch + collabAuthHeaders (codegen OpenAPI quebra o barrel api-zod).
