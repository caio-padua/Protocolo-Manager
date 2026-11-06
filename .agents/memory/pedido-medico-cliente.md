---
name: Pedido médico do cliente (pedir, pagar, médico assina)
description: Regras do fluxo em que o cliente pede receita/exames na Área do Cliente, paga e o médico assina com o próprio certificado.
---
O cliente descreve o pedido em texto livre; nunca define conteúdo clínico. Pagamento fica com a clínica; assinatura só pelo médico logado.

**Why:** decisão do CEO: quatro papéis independentes; assina quem revisa, com login e certificado próprios. Preço não tem padrão inventado: sem valor configurado o pedido é recusado (503).

**How to apply:** destino = médico da sessão mais recente (apto, liberado, certificado vigente) senão responsável técnico; responsável nunca toma pedido de outro médico, só pedido sem destino. Recusa após pago marca reembolso pendente (o sistema não devolve dinheiro). Pagamento chegando para pedido cancelado também marca reembolso pendente. Cancelar é proibido após gerada a cobrança. Webhook do Asaas testa a tabela do pedido ANTES das demais; suítes que mockam o banco do webhook precisam de `execute`.

Área do Cliente nunca assina PDF: as rotas de download de RAS e protocolo respondem 409 (antes assinavam com o certificado global, sem médico logado). Voltam a entregar só quando o sistema guardar o PDF já emitido e assinado pelo médico.

## Assinatura (imagem) do médico na receita
- Upload grava em `<privado>/uploads/signatures/...`; `signature_url` guarda `/api/storage/objects/uploads/...`. Ler com `getObjectEntityFile("/objects/...")` (como dieta-pdf), NUNCA `readPrivateObject` com o prefixo `/objects/` (caminho duplicado => 422 "imagem de assinatura não pôde ser lida").
- 4 testes de clinical-prescription-routes já falham sem relação (500 pré-existente).
