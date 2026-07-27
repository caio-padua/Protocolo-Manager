# CARTA AO DR. CODE — Planos propostos ao cliente (Circulos PAXTER)

De: Dr. Replit Paxter (Replit, codigo + dados reais)
Para: Dr. Code (GitHub / Railway)
Data: 27/07/2026
Assunto: O que JA EXISTE sobre categorias/planos do cliente — para nao reinventar

## 1. CONCLUSAO

A categoria de plano do cliente EXISTE como decisao martelada e como mockup
aprovado no Canvas (ENTREGA 38/39, reabertas hoje como ENTREGA 52). NAO existe
ainda no banco nem nas rotas. O nome "Rodio" que o CEO citou por voz e, no
sistema, a "Regra do Rodio" (conduta, Art. 64 do Codigo Paxter) — o plano
equivalente chama-se OURO na taxonomia validada.

## 2. TAXONOMIA VALIDADA PELO CEO (26/06/2026) — 4 CIRCULOS PAXTER

| Circulo  | Posicao | Regra de solicitacoes                              |
|----------|---------|----------------------------------------------------|
| NOIR     | Topo    | Solicitacoes a vontade, sem custo (concierge)       |
| PLATINA  | 2a      | Cortesias mensais incluidas + excedente pago        |
| OURO     | 3a      | Todas as solicitacoes pagas (com desconto)          |
| BRONZE   | Base    | Todas as solicitacoes pagas (preco cheio)           |

Direitos tipicos (o que o CEO descreveu como "rodio" = OURO para cima):
solicitar exames, tirar duvidas pelo app com PRAZO de resposta (SLA),
encaminhamento, laudo, atestado, formula a parte, renovar receita.

## 3. O QUE JA ESTA CONSTRUIDO (parcial ou total)

| Peca                                             | Estado          |
|--------------------------------------------------|-----------------|
| Area do Cliente real (12 rotas, login proprio)   | TOTAL           |
| Solicitar Exames (exam-requests)                 | TOTAL           |
| Documentos: laudo, atestado, encaminhamento      | TOTAL           |
| Cobranca Asaas (link de pagamento real)          | TOTAL           |
| Mockup da home com coroa + Circulos (E38 -> E52) | TOTAL (mockup)  |
| Mockup da vitrine DEMO do prospect (E39 -> E52)  | TOTAL (mockup)  |
| usePlano() no cockpit (basico/premium)           | PARCIAL (stub, sempre "premium") |
| Campo categoria do cliente no banco (clients)    | NAO EXISTE      |
| Regras de cortesia/cobranca por circulo          | NAO EXISTE      |
| Rota publica da vitrine (fora do /area)          | NAO EXISTE      |
| Contrato + link de upgrade apos a descoberta     | NAO EXISTE      |

## 4. TRAVAS DO CEO (marteladas — quebra-las e retrabalho certo)

1. Desejo IMPLICITO: proibido "compare os planos", preco ou upsell na home.
   Os planos ficam atras de um ICONE-COROA; o cliente descobre clicando.
2. Area do Cliente e UMA so (porta unica): categoria e ATRIBUTO do cliente,
   nunca area separada por plano.
3. Prospect NUNCA entra na area real: vitrine publica separada, so leitura,
   dados de exemplo, fita DEMONSTRACAO, CTA "QUERO SER CLIENTE", sem preco.
4. Itens premium fora do plano: cadeado dourado discreto, sem preco.
5. Pagamento: Asaas (default ja integrado). Para a conta do CEO, todos os
   valores a R$ 1,00 (pagamento real de teste).

## 5. FONTES (verificadas hoje no codigo/spec)

- specs/acompanhamento-e-area-paciente.md secoes 9 e 10 (taxonomia + regras)
- mockups: mockup-sandbox .../area-cliente/AreaCliente.tsx e
  .../vitrine-demo/VitrineDemo.tsx (vivos, reabertos no Canvas E52)
- usePlano: padcom .../cockpit-cliente/hooks/usePlano.ts (stub)
- "Rodio" no repo: apenas Regra do Rodio (CODIGO-PAXTER.md Art. 64) — zero
  ocorrencias como plano/categoria.

## 6. PEDIDO AO DR. CODE

Nada a executar agora. Esta carta e inventario para o desenho do mapa de
entradas: quando formos construir a onda dos planos, a base e a taxonomia
acima + campo categoria em clients + regras por circulo. Nao criar schema
novo sem falar comigo (regra de ouro: ADD COLUMN, nunca reconstruir).

-- Dr. Replit Paxter
