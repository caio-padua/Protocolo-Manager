# CARTA DE VALIDAÇÃO — DR. MANUS E DR. CODE
**De:** Dr. Replit Paxter
**Para:** Dr. Manus · Dr. Code
**Cópia:** CEO Dr. Caio
**Data:** 12/08/2026 — 14h45 BRT
**Assunto:** Sessão 12/08 — entregáveis completos, decisões formalizadas, o que cada um precisa validar

---

> **Regra de uso:** este documento substitui qualquer carta anterior sobre o Caso 9.
> A fonte normativa de arquitetura continua sendo `docs/concierge/ARQUITETURA.md`.
> Este arquivo é o relatório de execução desta sessão — não o normativo.

---

## 1. O QUE FOI ENTREGUE (commits em ordem cronológica)

| Hash curto | Hash completo | O que faz |
|---|---|---|
| `3bebcde` | `3bebcde11c184e40aa2f882bfea3863f30858812` | **Caso 7** — guard runtime `eventId` obrigatório em `registrarFalha`; **Caso 9A** — guard duplo-observador no polling (`jaTemEventoWebhookParaSreq`) |
| `0187c3d` | `0187c3d1e534955a473d71f09dbcebf5e874de08` | **Caso 9B** — `shared:{sreqId}:{chargeId}:{desfecho}` em polling E webhook; `jaTemEventoParaSreq` substitui o guard anterior |
| `d0f50c2` | `d0f50c2001d452b873dc359dba9eb5404c049d33` | **ARQUITETURA.md** — seções 5.3 e 5.4 reescritas para Option B; decisão `updated_at` registrada formalmente |

Todos os commits estão no `main` do GitHub:
`https://github.com/caio-padua/Protocolo-Manager`

---

## 2. RESULTADO DOS TESTES — SAÍDA BRUTA

```
 Test Files  2 passed (2)
      Tests  48 passed (48)
   Duration  1.65s
```

Arquivos cobertos:
- `src/tests/concierge-penalidade.test.ts`
- `src/tests/concierge-penalidade-lib.test.ts`

---

## 3. DECISÕES FORMALIZADAS NESTA SESSÃO

### 3.1 — Caso 9B: Option B escolhida (veredito do Dr. Code)

**Opção A rejeitada** porque quebraria os Cenários 5 e 6 do arquivo de teste:
- Cenário 5: `4 falhas sobre bloqueado → permanece bloqueado` (bloco `getPenalidade`)
- Cenário 6: `CPF inválido → sem penalidade, sem tocar banco` (bloco `getPenalidade`)

Option A adicionaria um SELECT extra dentro do fluxo de `registrarFalha`.
O `makeStatefulMock()` discrimina chamadas por conteúdo SQL — esse SELECT extra
dessincronizava o estado interno e os cenários falhavam com contagens erradas.

**Option B implementada:**
```
Formato compartilhado:  shared:{sreqId}:{asaasChargeId}:{desfecho}

Polling  → shared:${row.id}:${row.asaasChargeId ?? "nocharge"}:${mapped}
Webhook  → shared:${sreq.id}:${payment.id}:expirado   (ou cancelado)
```

`payment.id` (webhook) == `asaasChargeId` (polling): mesmo ID Asaas.
`ON CONFLICT (event_id) DO NOTHING` no CTE deduplica atomicamente — qualquer ordem de chegada.

### 3.2 — Guard 9A (polling) — FICA

O guard `jaTemEventoParaSreq` no caminho de polling permanece como defesa-em-profundidade:
- Não quebra Casos 5 e 6 (está em `scheduling.ts`, não em `registrarFalha`)
- Economiza roundtrip quando o mesmo `sreq` é consultado repetidamente
- Gera log rastreável: `"evento já registrado para este sreq"`
- CTE garante a correção independentemente do guard

### 3.3 — Pergunta do ciclo: `updated_at` NÃO será adicionado

Pergunta pendente há duas rodadas:
> A tabela `scheduling_requests` precisa de coluna `updated_at`?

**Resposta formal: NÃO.**

`asaasChargeId` serve como discriminador de reativação por razão semântica mais precisa:
muda exatamente quando uma nova cobrança é criada no Asaas — o mesmo evento que
separa dois vencimentos reais do mesmo pedido. `updated_at` mudaria por outras razões
(updates internos de status), gerando `event_id` únicos desnecessários.

Em produção, todo `sreq` concierge com status `expirado` tem `asaasChargeId` preenchido.
O fallback `?? "nocharge"` cobre desenvolvimento sem charge real.

**Registrado formalmente na ARQUITETURA.md seção 5.4 (commit `d0f50c2`).**

### 3.4 — Três condições do Option B — todas verificadas

| # | Condição | Evidência |
|---|---|---|
| 1 | `payment.id == asaasChargeId` — mesmo ID nos dois caminhos | `asaas.ts` linha 665: `eq(schedulingRequestsTable.asaasChargeId, payment.id)` |
| 2 | Formato idêntico nos dois caminhos | `shared:` aplicado em `scheduling.ts` e `asaas.ts` |
| 3 | `asaasChargeId` muda por reativação — segundo vencimento real gera `event_id` diferente | Por design: nova cobrança Asaas = novo `payment.id` |

---

## 4. O QUE O DR. MANUS PRECISA FAZER

### 4.1 — Re-rodar o bloco #81-A com o formato `shared:`

O bloco #81-A (8 casos de idempotência, seção 8.2 da ARQUITETURA) foi especificado
quando o formato era `poll:{id}:{status}:{updated_at}`. O formato mudou para `shared:`.

Os **comportamentos testados continuam válidos** — o que mudou é o `event_id` que o
banco armazena. Se qualquer caso do bloco #81-A inspecionar o valor literal do `event_id`,
ele precisa ser atualizado para o formato `shared:`.

**Pré-requisito:** fazer `git pull origin main` antes de rodar — os commits `0187c3d` e
`d0f50c2` precisam estar no ambiente.

### 4.2 — Verificar os casos 13 a 20 da ARQUITETURA (seção 8.2)

| # | Evento | Resultado esperado |
|---|---|---|
| 13 | `PAYMENT_OVERDUE` 1x | `tentativas=1`, não re-registra na reentrega |
| 14 | `PAYMENT_DELETED` 1x | `tentativas=1` |
| 15 | `PAYMENT_REFUNDED` 1x | `tentativas=1` |
| 16 | `PAYMENT_CHARGEBACK_REQUESTED` 1x | `tentativas=1` |
| 17 | `PAYMENT_OVERDUE` ×3 reentregas | `tentativas=1` (não 3) |
| 18 | `PAYMENT_DELETED` + `PAYMENT_REFUNDED` (eventos distintos) | `tentativas=2` |
| 19 | `PAYMENT_OVERDUE` → `PAYMENT_PAID` | `tentativas=0` (piso) |
| 20 | `PAYMENT_PAID` sem evento anterior | `tentativas=0` (piso) |

**Nota:** esses casos usam o modelo v1 (`tentativas_falha INTEGER`). O modelo v2
(`score_pontos NUMERIC`) é do #77 — responsabilidade do Dr. Code. Rodar #81-A
com o modelo atual é correto e esperado.

### 4.3 — Porta de saída

Quando o #81-A estiver verde, postar no `#padaxor-projeto` com:
1. Hash do commit rodado
2. Saída bruta dos testes colada (não resumida)
3. Confirmação de que a planilha foi atualizada (coluna H = CONCLUÍDO para o #75)

Sem os três itens, o #75 não fecha.

---

## 5. O QUE O DR. CODE PRECISA CONFIRMAR

### 5.1 — Option B: alinhamento com a ARQUITETURA

A seção 5.3 da ARQUITETURA foi reescrita para refletir o formato `shared:`.
Confirmar que o normativo está correto e consistente com o que o Dr. Code decidiu.

Arquivo: `docs/concierge/ARQUITETURA.md` — commit `d0f50c2`.

### 5.2 — Guard 9A: concordância com a decisão de manutenção

O Dr. Code perguntou se o guard deve sair. A decisão tomada aqui foi mantê-lo.
Se o Dr. Code discordar com fundamento, abrir discussão no `#padaxor-projeto`
com o caso específico que a manutenção quebra.

### 5.3 — Pergunta do ciclo: `updated_at` encerrada

A seção 5.4 da ARQUITETURA agora registra que `updated_at` não será adicionado.
Se houver caso em que `asaasChargeId` seja insuficiente como discriminador,
sinalizar — senão, encerrada.

### 5.4 — Sequência de execução (Dr. Code não bloqueia nada)

Conforme seção 9 da ARQUITETURA:

| Passo | Quem | Item | Dependência |
|---|---|---|---|
| 2 | Dr. Manus | #81-A verde | Valida #75 ← **PRÓXIMO** |
| 3 | Dr. Code | #77 peso por desfecho | Após #81-A verde |
| 4 | Dr. Code | #78 janela + decaimento | Após #77 |
| 5 | Dr. Code | #79 verificação por código | Após #75 |
| 6 | Dr. Manus | #81-B | Após #77, #78, #79 |
| 7 | Dr. Manus | #80 fricção por dispositivo | Após #79 |
| 8 | Dr. Manus | #81-C + #85 | Após #80 |
| 9 | Dr. Replit | #84 frontend throttled | Após #81-C |

O Dr. Code pode iniciar #79 em paralelo com #77 e #78 (ambos dependem de #75, que está verde).

---

## 6. ARQUIVOS MODIFICADOS NESTA SESSÃO

| Arquivo | Mudança | Commit |
|---|---|---|
| `artifacts/api-server/src/lib/concierge-penalidade.ts` | Guard `eventId` Caso 7; `jaTemEventoParaSreq` substitui guard anterior; docstring formato `shared:` | `3bebcde`, `0187c3d` |
| `artifacts/api-server/src/routes/scheduling.ts` | Import `jaTemEventoParaSreq`; `sharedEventId` com formato `shared:` no polling | `3bebcde`, `0187c3d` |
| `artifacts/api-server/src/routes/asaas.ts` | `sharedEventId` com formato `shared:` nos dois webhooks (expirado, cancelado) | `3bebcde`, `0187c3d` |
| `artifacts/api-server/src/tests/concierge-penalidade.test.ts` | `eventId` adicionado em todas as chamadas; 2 novos casos de guard | `3bebcde` |
| `artifacts/api-server/src/tests/concierge-penalidade-lib.test.ts` | Idem; 4 novos casos | `3bebcde` |
| `docs/concierge/ARQUITETURA.md` | Seções 5.3 e 5.4 reescritas para Option B e decisão `updated_at` | `d0f50c2` |

---

## 7. INVARIANTES QUE DEVEM CONTINUAR VERDADEIROS (ARQUITETURA seção 10)

Ao rodar qualquer teste ou revisão, confirmar que estas afirmações são verdadeiras:

1. Nenhuma penalidade é gravada sem `eventId` rastreável. ✅ Guard Caso 7
2. Nenhuma penalidade é gravada em CPF de identidade não verificada. ← Pendente #79
3. Nenhum limite é aplicado por IP isolado. ← Pendente #80
4. A pontuação nunca fica negativa. ← Pendente #77 (piso implementado no SQL com GREATEST)
5. Não existe bloqueio permanente. ← Pendente #77 (suspensão 180d, retorno ao nível 2,0)
6. A via comum permanece sempre acessível. ✅ Guard #76 apenas bloqueia Concierge
7. Nenhum dado clínico trafega em canal de mensagem. ✅ Mensageria só avisa

---

## 8. COMO AUDITAR O QUE FOI FEITO

```bash
# 1. Atualizar o repositório local
git pull origin main

# 2. Ver os commits desta sessão
git log --oneline 3bebcde^..d0f50c2

# 3. Rodar os testes
cd artifacts/api-server
npx vitest run src/tests/concierge-penalidade.test.ts src/tests/concierge-penalidade-lib.test.ts

# 4. Verificar o formato shared: no polling
grep -n "sharedEventId\|shared:" src/routes/scheduling.ts | head -10

# 5. Verificar o formato shared: no webhook
grep -n "sharedEventId\|shared:" src/routes/asaas.ts | head -10

# 6. Verificar o guard no polling
grep -n "jaTemEventoParaSreq" src/routes/scheduling.ts

# 7. Confirmar que asaas.ts busca sreq por asaasChargeId
grep -n "asaasChargeId.*payment\.id\|payment\.id.*asaasChargeId" src/routes/asaas.ts
```

---

## 9. PENDÊNCIAS FORA DO ESCOPO DESTA SESSÃO

| Item | Responsável | Depende de |
|---|---|---|
| #77 — peso por desfecho (`score_pontos NUMERIC`) | Dr. Code | #81-A verde |
| #78 — janela, decaimento, suspensão 180d | Dr. Code | #77 |
| #79 — verificação de identidade por código no canal | Dr. Code | #75 (verde ✅) |
| #80 — fricção por dispositivo | Dr. Manus | #79 |
| #81-A — 8 casos de idempotência | **Dr. Manus — PRÓXIMO** | #75 (verde ✅) |
| #81-B — 8 casos CPF + caso 21 guard + faixas | Dr. Manus | #77, #78, #79 |
| #81-C + #85 — 4 casos dispositivo | Dr. Manus | #80 |
| #82 — migrar `concierge_penalidades` para Drizzle | Dr. Code | #77 |
| #83 — Tela Inteligência Comercial | Dr. Manus | #77, #78, #79 |
| #84 — frontend `agendar.tsx` trata `throttled` + `requiresVerification` | Dr. Replit | #81-C |
| #86 — semântica de textos na tela | — | #84 |

---

— Dr. Replit Paxter
Repositório: `github.com/caio-padua/Protocolo-Manager`
ARQUITETURA normativa: `docs/concierge/ARQUITETURA.md` (commit `d0f50c2`)
Testes: 48/48 ✅ — `artifacts/api-server/src/tests/concierge-penalidade{.test,.lib.test}.ts`
