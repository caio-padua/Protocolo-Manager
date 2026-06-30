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

## Blindagem aplicada (IDOR + corrida) — RESOLVIDO
- **Cracha (token de posse) RESOLVE o IDOR/enumeração:** a criação (`POST /scheduling/requests`)
  agora emite um token HMAC assinado (escopo "agendar", TTL 24h, payload:sig base64url
  com `SESSION_SECRET`) via `createSchedulingToken(id)`. Esse cracha é EXIGIDO em
  `concierge-charge`, `payment-status` e no `PATCH` — sem token válido => 403. O helper
  `schedulingTokenMatches` aceita o token no header `x-scheduling-token` (rota GET, sem
  corpo) OU no `accessToken` do body, e confere `verifySchedulingToken(raw) === id` (token
  amarrado AQUELA solicitação). Este é o token de posse que o item anterior pedia; só vale
  para o fluxo público de agendamento — o resto da API segue single-tenant sem authz
  (ver `admin-api-sem-auth.md`).
- **Corrida na criação da cobrança RESOLVIDA:** `concierge-charge` roda dentro de
  transação com `pg_advisory_xact_lock(id)`, re-lê a linha "fresh" e aplica a idempotência
  DENTRO da trava (200 reuse se já existe `asaasChargeId` / 201 created). Duas chamadas
  simultâneas não geram mais duas cobranças. `asaasFetch` ganhou timeout
  (`AbortSignal.timeout(20000)`) para o provedor travado não segurar a advisory lock.
- **Armadilha que custou tempo:** o dev server serviu CÓDIGO STALE — o primeiro curl
  passou (201 sem token, criou cobrança real PROD com CPF falso) porque o api-server não
  recarregou as edições. SEMPRE reiniciar o workflow do api-server antes de validar gate
  novo por curl; "passou no curl" sem restart não prova nada.
- **Frontend (`agendar.tsx` DrCaioFlow):** guarda `created.accessToken` em state; `doCharge`
  recebe o token EXPLÍCITO (no mesmo clique create->charge o state ainda está stale);
  payment-status manda o token via `request.headers["x-scheduling-token"]` (opção do hook
  Orval, customFetch faz merge), com polling só habilitado quando há token.
- Compare de assinatura não é timing-safe; architect classificou como não-bloqueante
  neste contexto.

## Detalhes do contrato que dependem de schema (não-óbvios)
- Concierge NÃO entra em `payments` (coluna `clientId` é NOT NULL e o paciente público
  não tem client); o estado de pagamento mora só em `scheduling_requests`.
- Cobrança usa `billingType` UNDEFINED (página hospedada do Asaas: PIX/cartão/boleto).
- A chave Asaas é de PRODUÇÃO: PIX real só confirma no app publicado; no preview valida-se
  só a montagem. Nunca disparar cobrança real com CPF falso na conta de produção do CEO.
