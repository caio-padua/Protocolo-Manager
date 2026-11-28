# Pedido médico do cliente (Área do Cliente) — Entrega 1: servidor

Estado de engenharia: EM CONSTRUÇÃO (Art. 77).

## Finalidade
O cliente pede, na Área do Cliente, uma receita ou um pedido de exames, paga, e o
pedido cai na fila do médico. O médico entra com o login dele, emite o documento pelo
Cockpit (assinando com o PRÓPRIO certificado) e marca o pedido como emitido.
O cliente NUNCA escolhe conteúdo clínico: descreve o que precisa em texto livre.

## Papéis (4 independentes)
Titular da licença / Administrador / Médico responsável técnico / Médico que assina.
Este módulo usa: cliente (pede e paga), médico habitual (revisa e assina),
médico responsável técnico (reserva e redistribuição).

## Fluxo
aguardando_pagamento -> pago -> em_analise -> emitido | recusado ; cancelado (só antes de pagar).

1. Cliente cria o pedido (tipo + descrição). Valor lido de `pay.pedidoMedico.<tipo>`;
   sem valor configurado (mínimo R$ 5,00 do Asaas) = recusa 503 clara. Nunca inventa preço.
2. Cliente gera a cobrança (PIX ou cartão), idempotente por pedido (trava consultiva).
3. Webhook do Asaas confirma pagamento -> status `pago` + roteamento.
4. Roteamento: médico da sessão mais recente do cliente, se ativo, com vínculo e liberação
   da ferramenta na unidade e certificado vigente; senão o médico responsável técnico da
   unidade; senão fica sem destino e só o responsável/administração enxerga.
5. Médico destino inicia análise, emite pelo Cockpit e marca `emitido`; ou recusa com motivo.
6. Recusa depois de pago marca `reembolso_pendente`: o sistema NÃO devolve dinheiro sozinho.

## Falhas previstas
| Falha | Tratamento |
|---|---|
| clientId vindo do navegador | proibido: sempre do token do cliente |
| Cobrança duplicada (duplo clique) | trava consultiva + reuso da cobrança |
| Webhook repetido | atualização condicional por status (idempotente) |
| Pagamento vencido/estornado | vencido sem pagar = cancelado; estornado após pago = reembolso_pendente |
| Médico habitual sem certificado/inativo | vai ao responsável técnico |
| Médico de outra clínica tenta agir | recusa 404 (isolamento por empresa/unidade) |
| Redistribuir para médico sem vínculo | recusa 422 |
| Preço não configurado | 503, nada é cobrado |
| Cliente sem unidade/empresa | 409, pedido não roteável |

## Fora desta entrega
Telas (Entrega 2), reembolso automático, vínculo fixo "médico habitual" cadastrável.

## Provas (Art. 69/81)
Testes sintéticos com Asaas e banco simulados: criar sem preço, idempotência da cobrança,
isolamento do cliente, webhook idempotente, roteamento habitual x responsável, ação de
médico estranho, recusa com reembolso pendente.
