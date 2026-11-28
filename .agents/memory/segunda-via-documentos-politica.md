---
name: Segunda via de documentos — política
description: Regras decididas pelo CEO e lições duráveis sobre cobrança, Members, webhook e recusa.
---
Tratamento vigente = cópia gratuita; fora da vigência = taxa (padrão R$ 15, editável) só se o original existir. Members só vale com assinatura verificada; sem fonte verificável cai em revisão humana, sem cobrança.

**Why:** o CEO escolheu "só assinatura verificada"; IA nunca decide elegibilidade nem pagamento.

**How to apply:**
- Webhook de pagamento só dispara conferência: confirmar o estado por leitura direta no provedor antes de marcar pago.
- Recusar pedido com cobrança existente ou incerta é bloqueado (a cobrança pode seguir exigível).
- Toda entrega de segunda via deve passar por um único caminho com política, e o escopo de clínica deve ser o da emissão, nunca o cadastro atual do cliente.
- Escopo de emissão (clínica/unidade) é gravado por gatilho no banco e é imutável; documento legado sem escopo (NULL) vai para revisão humana, nunca herda a unidade atual.
- Revisão humana não libera nada: congela a taxa e pede o "sim" do cliente (oferta com id negativo); depois do "sim" segue cobrança/entrega sem nova revisão.
- Reenvio manual por profissional passa pela mesma política; só cópia gratuita (tratamento vigente) sai direto.
- Teste real (20/11/2026): chave Asaas do ambiente de desenvolvimento é de PRODUÇÃO; aviso do Asaas não chega ao dev, usar a conferência por leitura direta.
