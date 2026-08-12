# ESPECIFICAÇÃO TÉCNICA — DR. MANUS (Art. 72 — Árbitro Cruzado)

**Data:** 12/08/2026
**Itens:** #80, #81, #83 (planilha de produção)

---

## ITEM #80 — Fricção por dispositivo/sessão na camada não verificada

### Contexto
A revisão do Dr. Code identificou que o CPF não é verificado antes de penalizar, o que permite:
- Curioso contornar digitando outro CPF
- Terceiro queimar o CPF de um paciente legítimo

**Camada 1 (não verificada):** fricção por dispositivo e sessão — não por CPF. Segura o curioso que não vai verificar identidade.

### Especificação técnica

**Arquivo novo:** `artifacts/api-server/src/lib/device-throttle.ts`

**Tabela nova:** `device_offer_limits` (criada lazy, fora do Drizzle — mesmo padrão do concierge_penalidades)

```sql
CREATE TABLE IF NOT EXISTS device_offer_limits (
  id SERIAL PRIMARY KEY,
  device_fingerprint TEXT NOT NULL,
  offer_count INTEGER NOT NULL DEFAULT 0,
  first_offer_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_offer_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Fingerprint do dispositivo:** combinar 3 fontes (ordem de preferência):
1. `X-Device-Fingerprint` header (gerado no frontend via fingerprintjs ou hash de navigator.userAgent + screen + timezone + language)
2. IP do request (`req.ip`)
3. Cookie `device_id` gerado no primeiro acesso (UUID v4, HttpOnly)

**Regras:**
- Máximo **5 ofertas por dispositivo por dia** (00:00–23:59 BRT)
- Após limite: retornar `{ throttled: true, message: "Você já gerou várias ofertas hoje. Aguarde até amanhã ou entre com sua conta para continuar." }`
- Se o dispositivo JÁ tem identidade verificada (CPF confirmado via código no canal), o limite não se aplica
- O limite NÃO penaliza — apenas desacelera. Não grava na tabela de penalidades.

**Endpoint afetado:** `GET /api/scheduling/concierge-offer`

**Função exportada:**
```typescript
export interface DeviceThrottleResult {
  allowed: boolean;
  remaining: number;
  throttled: boolean;
  message?: string;
}
export async function checkDeviceThrottle(
  req: Request,
): Promise<DeviceThrottleResult>;
```

**Integração no scheduling.ts:**
```typescript
// Antes de processar concierge-offer, verificar throttle por dispositivo
const throttle = await checkDeviceThrottle(req);
if (!throttle.allowed) {
  res.json({
    blocked: false,
    throttled: true,
    message: throttle.message,
  });
  return;
}
```

### Por que isso não vira arma
- Não é transferível: o fingerprint está amarrado ao navegador/dispositivo do curioso
- Não expõe dados do paciente: não usa CPF, não usa identidade
- Não penaliza: apenas limita frequência de geração de ofertas
- Um concorrente precisa estar fisicamente no mesmo dispositivo para ser afetado

---

## ITEM #81 — Bateria de 20 casos determinísticos

### Suíte 1: Abuso e identidade (12 casos)

| # | CPF | Cenário | Resultado esperado |
|---|---|---|---|
| 1 | CPF próprio limpo (0 falhas) | Oferta normal | `blocked: false, penalidade_dias: 0` |
| 2 | CPF de terceiro (1 falha) | Oferta com +7d | `penalidade_dias: 7` |
| 3 | CPF de terceiro (3+ falhas, bloqueado) | Bloqueado | `blocked: true` |
| 4 | CPF inexistente (nunca visto) | Oferta normal | `blocked: false, penalidade_dias: 0` |
| 5 | CPF malformado (< 11 dígitos) | Ignorado | `blocked: false, penalidade_dias: 0` |
| 6 | CPF malformado (letras) | Ignorado | `blocked: false, penalidade_dias: 0` |
| 7 | CPF vazio/null | Ignorado | `blocked: false, penalidade_dias: 0` |
| 8 | CPF com máscara (111.111.111-11) | Normalizado → 0 falhas | `blocked: false, penalidade_dias: 0` |
| 9 | Mesma IP de terceiro (2 dispositivos) | Cada um tem seu limite | Ambos recebem oferta |
| 10 | Dispositivo A estourou limite (5 ofertas) | Throttled | `throttled: true` |
| 11 | Dispositivo B (mesma rede) | Não afetado | `throttled: false, allowed: true` |
| 12 | Dispositivo verificado (CPF confirmado) | Limite não aplica | `throttled: false` mesmo após 5 ofertas |

### Suíte 2: Idempotência sobre desfechos de cartão (8 casos)

| # | Evento Asaas | Primeira entrega | Reentrega (duplicada) | Estado após 2ª entrega |
|---|---|---|---|---|
| 13 | PAYMENT_OVERDUE | Falha registrada (+1) | NÃO re-penaliza | Tentativas = 1 (não 2) |
| 14 | PAYMENT_DELETED | Falha registrada (+1) | NÃO re-penaliza | Tentativas = 1 |
| 15 | PAYMENT_REFUNDED | Falha registrada (+1) | NÃO re-penaliza | Tentativas = 1 |
| 16 | PAYMENT_CHARGEBACK_REQUESTED | Falha registrada (+1) | NÃO re-penaliza | Tentativas = 1 |
| 17 | PAYMENT_OVERDUE ×3 (3 reentregas) | +1 | +0, +0 | Tentativas = 1 |
| 18 | PAYMENT_DELETED + PAYMENT_REFUNDED (eventos distintos) | +1, +1 | — | Tentativas = 2 |
| 19 | PAYMENT_OVERDUE seguido de PAYMENT_PAID (pagou depois) | +1, depois -1 | — | Tentativas = 0 (reset parcial) |
| 20 | PAYMENT_PAID sem evento anterior | -1 (não pode ser negativo) | — | Tentativas = 0 |

### Nota sobre implementação da idempotência (depende de #75)
A coluna `penalidade_registrada` em `scheduling_requests` deve ser marcada quando `registrarFalha` é chamado. Se já marcada para aquele evento_id, pular.

---

## ITEM #83 — Tela Inteligência Comercial (Opção A)

### Escopo
Unificar o que JÁ EXISTE, sem instrumentar nada novo:

**Dados disponíveis hoje:**
- Funil concierge: `scheduling_requests` (status, path=concierge|fila)
- Vitrine-leads: `vitrine_contatos`
- Eventos guia digital: tabela de eventos do onboarding

**Tela:** `/inteligencia`
- 3 cards de resumo (funil concierge, vitrine-leads, eventos guia)
- 1 tabela combinada com data, evento, status
- Filtro por período (7d, 30d, 90d)

**NOTA:** Este item é "depois" — só deve ser construído após #77, #78, #79 estarem prontos.

---

## ORDEM DE EXECUÇÃO (conforme Seção 7 da revisão)

| Ordem | Item | Responsável | Dependência |
|---|---|---|---|
| 1 | #75 Idempotência webhook | Dr. Replit | — |
| 2 | #76 Guard backend | Dr. Replit | — |
| 3 | #77 Peso por desfecho | Dr. Code | #75 |
| 4 | #78 Janela + decaimento | Dr. Code | #77 |
| 5 | #79 Verificação por código | Dr. Code | #75 |
| 6 | #80 Fricção por dispositivo | Dr. Manus | — |
| 7 | #81 Bateria de 20 casos | Dr. Manus | #75, #79 |
| 8 | #82 Migrar para Drizzle | Dr. Code | #77 |
| 9 | #83 Tela IC | Dr. Manus | #77, #78, #79 |

**P0 (crítico, antes de webhook real):** #75 e #76 — Dr. Replit
**P1:** #77-#81 — Dr. Code (#77-#79) e Dr. Manus (#80-#81)
**P2:** #82, #83 — depois que P0 e P1 estiverem rodando

---

## DECISÕES DO CEO CONFIRMADAS
- **Decisão A:** Reset ao pagar = parcial (-1,0 ponto), não zerar ✅
- **Decisão B:** Tela IC = Opção A (unificar), mas DEPOIS ✅
