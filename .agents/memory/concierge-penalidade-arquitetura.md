---
name: Concierge Penalidade — arquitetura aprovada + idempotência resolvida
description: Decisões arquiteturais da trava de escassez do Concierge. Inclui Option B (shared: eventId), guard 9A, decisão updated_at, e sequência de execução #75→#84.
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

### Decaimento e suspensão

- Decaimento: −1,0 a cada 90 dias sem incidente (job mensal)
- Suspensão: 180 dias → retorno automático ao nível 2,0 (não zero)
- Reset ao pagar: parcial (−1,0). Nunca zera.

## Idempotência — Option B (12/08/2026)

### Formato canônico do eventId

```
shared:{sreqId}:{asaasChargeId}:{desfecho}
```

- Polling: `shared:${row.id}:${row.asaasChargeId ?? "nocharge"}:${mapped}`
- Webhook: `shared:${sreq.id}:${payment.id}:expirado` (ou `:cancelado`)

**Why:** `payment.id` (webhook) == `asaasChargeId` (polling) — mesmo ID Asaas.
Dois caminhos observando o mesmo fato produzem `event_id` idêntico.
`ON CONFLICT (event_id) DO NOTHING` no CTE deduplica atomicamente — sem race condition, sem query extra.

**Arquivos:** `lib/concierge-penalidade.ts`, `routes/scheduling.ts`, `routes/asaas.ts`
**Commits:** `3bebcde` (Caso 7 + 9A), `0187c3d` (Caso 9B)

### Guard duplo-observador (9A) — FICA

`jaTemEventoParaSreq(sreqId)` no caminho de polling: defense-in-depth.
Checa se qualquer evento já existe para o sreqId antes de chamar `registrarFalha`.
Economiza roundtrip. O CTE garante correção independentemente.
**Não quebra** Cenários 5/6 (estão em `getPenalidade`, não em `registrarFalha`).

### `updated_at` — NÃO será adicionado a `scheduling_requests`

`asaasChargeId` é discriminador suficiente: muda quando nova cobrança é criada.
Semânticamente mais preciso que `updated_at` (identifica qual cobrança, não quando mudou algo).
Registrado formalmente na ARQUITETURA.md seção 5.4 (commit `d0f50c2`).

## Verificação de identidade antes de penalizar

- Camada 1 (sem identidade): fricção por dispositivo/sessão — não transferível.
- Camada 2 (com identidade): penalidade no CPF só após código confirmado via canal vinculado.
**Why:** CPF é dado público no Brasil. Sem verificação, terceiro queima CPF de paciente.

## Decisões do CEO confirmadas

- Reset ao pagar: SIM, parcial (−1,0). Nunca zera.
- Bloqueio permanente: removido. Suspensão de 180 dias com retorno automático.
- `updated_at` em `scheduling_requests`: NÃO adicionar.

## Sequência de execução (#75 verde = ponto de partida)

| Passo | Quem | Item |
|---|---|---|
| PRÓXIMO | Dr. Manus | #81-A (8 casos idempotência) |
| Após #81-A | Dr. Code | #77 peso por desfecho |
| Após #77 | Dr. Code | #78 janela + decaimento |
| Após #75 | Dr. Code | #79 verificação por código (paralelo ao #77/#78) |
| Após #79 | Dr. Manus | #80 fricção por dispositivo |
| Após #77/#78/#79 | Dr. Manus | #81-B |
| Após #80 | Dr. Manus | #81-C + #85 |
| Após #81-C | Dr. Replit | #84 frontend throttled/requiresVerification |

## Guard backend (#76) — já implementado

`POST /scheduling/requests` com `path=concierge` recebe 403 `CONCIERGE_BLOCKED`
quando CPF está suspenso. Linhas 495 e 915 de `scheduling.ts` — não mexer.

## Testes: 48/48 passando (12/08/2026)

Arquivos: `src/tests/concierge-penalidade.test.ts` + `concierge-penalidade-lib.test.ts`
