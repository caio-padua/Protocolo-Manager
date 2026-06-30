---
name: Pagamento Concierge — estado de pagamento é server-only
description: Como o gate "só libera o resultado após pago" deve ser defendido no backend, não só na UI.
---

# Estado de pagamento é server-only num fluxo público

**Regra:** num recurso público com gate de dinheiro (ex.: solicitação de agendamento
do caminho Concierge do Dr. Caio), o campo de estado de pagamento (`paymentStatus`,
`paidAt`, `asaas*`) NUNCA pode ser gravável pelo cliente. Ele só muda por três fontes
de confiança do servidor: a criação da cobrança, o polling (`/payment-status` lendo o
Asaas) e o webhook. O PATCH público deve fazer **whitelist** dos campos seguros
(`status`, `notes`, `chosenDate`, `chosenTime`) e montar o `.set()` só com eles —
nunca `{ ...parsed.data }`.

**Why:** mesmo com a UI travando o avanço (motor2 só com `status==="pago"`), se o
contrato/endpoint expõe `paymentStatus` no corpo, qualquer um faz
`PATCH /scheduling/requests/:id {paymentStatus:"pago"}` e pula a cobrança. Gate só de
front não é fronteira de confiança. O architect reprovou exatamente por isso.

**How to apply:** (1) tirar o campo sensível do schema OpenAPI do *body* de update e
rodar codegen; (2) no handler, destruturar só os campos permitidos e montar um objeto
`changes` campo a campo (defesa em profundidade, pois o zod já faz strip de chaves
desconhecidas). Validar por runtime/curl: PATCH com `paymentStatus:"pago"` tem de
voltar com o estado inalterado.

## Limitações conhecidas deste fluxo (decidir com o CEO antes de expandir escopo)
- **IDOR/enumeração:** os endpoints públicos de agendamento usam id numérico cru, sem
  token de posse. É a condição pré-existente de TODO o fluxo público `/agendar`
  (single-tenant, sem authz — ver `admin-api-sem-auth.md`). Para dinheiro real, o ideal
  é um token curto assinado emitido na criação da solicitação e exigido em
  charge/status/confirm. Não construir sem ordem do CEO.
- **Corrida na criação da cobrança:** idempotência por `asaasChargeId` cobre re-tentativa,
  mas duas chamadas simultâneas com id nulo podem gerar duas cobranças no Asaas. UI
  desabilita o botão; endurecer com lock/advisory ou pré-claim se virar problema real.

## Detalhes do contrato que dependem de schema (não-óbvios)
- Concierge NÃO entra em `payments` (coluna `clientId` é NOT NULL e o paciente público
  não tem client); o estado de pagamento mora só em `scheduling_requests`.
- Cobrança usa `billingType` UNDEFINED (página hospedada do Asaas: PIX/cartão/boleto).
- A chave Asaas é de PRODUÇÃO: PIX real só confirma no app publicado; no preview valida-se
  só a montagem. Nunca disparar cobrança real com CPF falso na conta de produção do CEO.
