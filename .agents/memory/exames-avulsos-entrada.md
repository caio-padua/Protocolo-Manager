---
name: Exames avulsos — entrada separada do pedido médico
description: Cliente escolhe exames e pede orçamento; não é prescrição; preço só do titular, editável até o aceite.
---
Tabela própria exam_avulso_requests; fluxo solicitado → orçamento publicado (titular, com confirmo) → aceito (cliente, com confirmo). Sem preço padrão inventado; exames resolvidos no servidor pelo catálogo ativo; clientId só do token.
**Why:** ordem do CEO: indicação clínica depende de avaliação profissional; escolha do cliente não é prescrição. Cobrança do aceite e emissão pelo médico ainda não existem.
**How to apply:** não reaproveitar client_medical_requests (exige preço fixo por tipo e pagamento antes do médico). Catálogo tem nomes duplicados (ex.: TSH com 2 códigos): curadoria pendente.
