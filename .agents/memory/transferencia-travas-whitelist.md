---
name: Movimentacao de dinheiro - travas antes do provedor
description: Padrao de seguranca para rotas que movem dinheiro (transferencia/saque) no Manager/Paxter.
---

Rota que move dinheiro (ex.: POST /asaas/transfer) deve aplicar as travas NESTA ordem,
ANTES de chamar o provedor externo:

1. `confirm === true` no corpo (a UI so envia apos passo de revisao) — senao 400.
2. Whitelist: destino tem de existir e estar `active` numa tabela de contas cadastradas — senao 404.
3. Valor minimo (>= 1) — senao 400.
4. Limite maximo de seguranca por operacao (ex.: R$ 5.000) — senao 400.
5. So entao chama o provedor; status devolvido e SEMPRE o real (nunca simulado).
6. Auditoria em `collaborator_audit` com destino MASCARADO (so 4 ultimos digitos do documento/chave), nunca o valor inteiro.

**Why:** dinheiro e irreversivel; a confirmacao tem de existir no backend (nao so na UI),
o destino tem de ser pre-autorizado (anti-fraude/anti-IDOR) e a auditoria nao pode vazar PII.

**How to apply:** vale para qualquer onda financeira futura (saque, repasse, pagamento a fornecedor).
Em teste automatico NUNCA disparar a transferencia real — validar so as travas por curl
(400/404/400/400) e parar antes do passo 5. Inferencia de tipo de chave Pix (pixTypeFromPerson)
so cobre CPF/CNPJ/EMAIL com robustez; PHONE/EVP caem em fallback e podem falhar no provedor —
endurecer antes de habilitar chave Pix livre.
