# Exames avulsos — entrada separada na Área do Cliente

Fonte: ordem do Dr. Caio de 14/11/2026.

## Objetivo
O cliente escolhe exames no catálogo ativo, pede informações e pede orçamento. Não é pedido médico.

## Regras
1. A escolha do cliente NÃO é prescrição nem indicação clínica. Toda tela do cliente repete: "A indicação depende de avaliação profissional."
2. Sem preço padrão inventado: o orçamento só existe depois que o titular da plataforma informa o valor.
3. Preço editável pelo titular enquanto o cliente não aceitou; publicar exige confirmação explícita (confirmo = true).
4. O cliente só aceita um orçamento publicado, com confirmação explícita; aceitar NÃO gera cobrança nesta etapa.
5. clientId vem sempre do token do cliente (anti-IDOR). Exames resolvidos NO SERVIDOR pelo catálogo ativo (código); nome vindo do navegador é ignorado.
6. Limites: 1 a 20 exames; no máximo 5 solicitações abertas por cliente; observação até 1000 caracteres.

## Estados
solicitado -> orcamento_enviado -> aceito; cancelado (cliente, antes de aceitar). Reorçar permitido só em solicitado/orcamento_enviado.

## Fora de escopo (pendente)
Cobrança do orçamento aceito (reutilizar cobrança do pedido médico) e emissão do pedido pelo médico após avaliação.
