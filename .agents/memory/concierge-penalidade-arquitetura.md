---
name: Concierge Penalidade — arquitetura aprovada + guard removido + reativação 3 estados
description: Decisões arquiteturais da trava de escassez do Concierge. Guard 9A REMOVIDO. Formato shared: eventId. Três estados de reativação (#87). Sequência de execução.
---

# Concierge Penalidade — Arquitetura Aprovada

## Regra vigente (v1 — base para #77 substituir)

Motor simples: conta falhas como INTEGER, todos os desfechos com peso 1,0.
Tabela: `concierge_penalidades` (lazy, fora do Drizzle — #82 vai migrar).
Falhas >= 3 → `bloqueado_permanente = true`.

## Arquitetura aprovada (v2 — Dr. Code define, #77/#78/#79 implementam)

### Peso por desfecho

| Desfecho | Peso |
|---|---|
| Cancelamento ativo (`PAYMENT_DELETED`) | +1,0 |
| Expiração sem ação (`PAYMENT_OVERDUE`) | +0,5 |
| Cartão recusado pelo emissor | +0,25 |
| Estorno (`PAYMENT_REFUNDED`) | +1,0 |
| Chargeback (`PAYMENT_CHARGEBACK_REQUESTED`) | +2,0 |
| Pagamento bem-sucedido (`PAYMENT_PAID`) | −1,0 |

Piso em 0,0. Score nunca negativo.

### Faixas de score

| Score | Estado | Efeito |
|---|---|---|
| 0,0–0,9 | Oportunidade plena | datas normais |
| 1,0–1,9 | Primeira quebra | +7 dias |
| 2,0–2,9 | Segunda quebra | +30 dias + aviso |
| ≥ 3,0 | Suspenso | 180 dias, retorno a 2,0 |

Decaimento: −1,0 a cada 90 dias sem incidente (job mensal).
Suspensão: 180 dias → retorno automático ao nível 2,0 (não zero).

## Idempotência — Option B (12/08/2026)

### Formato canônico do eventId

```
shared:{sreqId}:{asaasChargeId}:{desfecho}
```

- Polling: `shared:${row.id}:${row.asaasChargeId ?? "nocharge"}:${mapped}`
- Webhook: `shared:${sreq.id}:${payment.id}:expirado` (ou `:cancelado`)

**Why:** `payment.id` (webhook) == `asaasChargeId` (polling). Dois caminhos, mesmo fato, mesmo `event_id`. `ON CONFLICT (event_id) DO NOTHING` no CTE deduplica atomicamente.

### Guard duplo-observador (9A) — REMOVIDO em 12/08/2026

**DECISÃO: Guard removido.** `jaTemEventoParaSreq` apagado da lib e do import.

**Motivo:** o guard verificava se `sreq` já tinha **qualquer** evento. Com `shared:{sreqId}:{chargeId}:{desfecho}`, dois eventos legítimos do mesmo sreq (OVERDUE→CHARGEBACK) têm `event_id` distintos. O guard cortava o segundo **antes do CTE**, engolindo penalidade legítima silenciosamente. Código que só pode errar e nunca acertar, sai.

**CTE é suficiente:** `ON CONFLICT (event_id) DO NOTHING` garante atomicamente sem race condition.

### `updated_at` — NÃO será adicionado a `scheduling_requests`

`asaasChargeId` é discriminador suficiente. Decisão em ARQUITETURA.md seção 5.4.

### Colunas de auditoria em `concierge_webhook_eventos` (12/08/2026)

Adicionadas via `ADD COLUMN IF NOT EXISTS` em `ensureEventosTable()`:
- `scheduling_request_id INTEGER` — qual sreq gerou o evento
- `desfecho TEXT` — saída da auditoria
- `asaas_event_id TEXT` — payment.id do Asaas (Invariante 1: origem rastreável)

## Fix da reativação — #87 (12/08/2026): três estados, não dois

```
TERMINAL_FALHA = {expirado, cancelado, estornado, recusado, chargeback}
TERMINAL_SUCESSO = {pago, confirmado, recebido}
```

| Estado | Condição | Ação |
|---|---|---|
| 1 — Já pago | `asaasChargeId` + `TERMINAL_SUCESSO` | Devolve existente. `jaPago:true`. NUNCA cria. |
| 2 — Falha terminal | `asaasChargeId` + `TERMINAL_FALHA` | Cai para criação de nova cobrança. |
| 3 — Desconhecido/aguardando | Qualquer outro status | Devolve existente. NUNCA cria. |

**Why:** lista de exclusão (2 status) deixava "estornado/recusado/chargeback" passarem como vivos. Lista de permissão invertida era pior: "pago" geraria segunda cobrança para quem já pagou. Regra de fechamento: status desconhecido nunca dispara criação (falha fechada do lado do dinheiro).

**Arquivo:** `artifacts/api-server/src/routes/scheduling.ts` — dentro do `db.transaction`.

## Verificação de identidade antes de penalizar

- Camada 1 (sem identidade): fricção por dispositivo/sessão — não transferível.
- Camada 2 (com identidade): penalidade no CPF só após código confirmado via canal vinculado.

## Guard backend (#76) — já implementado

`POST /scheduling/requests` com `path=concierge` recebe 403 `CONCIERGE_BLOCKED`. Não mexer.

## Sequência de execução (após guard removido)

| Passo | Quem | Item | Status |
|---|---|---|---|
| PRÓXIMO | Dr. Manus | #81-A com caso 15 (OVERDUE→CHARGEBACK mesmo sreq) | Aguardando |
| Após #81-A verde | Dr. Code | #77 peso por desfecho | Bloqueado |
| Após #77 | Dr. Code | #78 janela + decaimento | Bloqueado |
| Após #75 | Dr. Code | #79 verificação por código | Pronto para iniciar |
| Após #79 | Dr. Manus | #80 fricção por dispositivo | Bloqueado |
| Após #77/#78/#79 | Dr. Manus | #81-B | Bloqueado |
| Após #80 | Dr. Manus | #81-C + #85 | Bloqueado |
| Após #81-C | Dr. Replit | #84 frontend throttled/requiresVerification | Bloqueado |

## Testes: 48/48 passando (12/08/2026, commit d8ee3a9)

Arquivos: `src/tests/concierge-penalidade.test.ts` + `concierge-penalidade-lib.test.ts`
