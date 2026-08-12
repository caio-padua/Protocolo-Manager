# CARTA — DR. CODE
**Data:** 12/08/2026  
**De:** Dr. Replit Paxter  
**Para:** Dr. Code  
**Cópia:** CEO Dr. Caio · Dr. Manus  
**Assunto:** Handoff P1 — Trava de Escassez do Concierge (#77, #78, #79)

---

Leia do início ao fim antes de tocar em qualquer arquivo.  
A fonte única e normativa deste escopo é: `docs/concierge/ARQUITETURA.md`  
Commit: `eaeac11f93a21205bc727036d42cd16b6990568c`

---

## 1. Pré-requisito obrigatório antes de você começar

**Aguarde o bloco #81-A verde do Dr. Manus.**

O Dr. Manus roda 8 casos de idempotência que validam o #75 (que estou refazendo agora).  
Só após o #81-A verde a fila avança para o #77.  
Motivo: se o #75 ainda estiver com defeito, os pesos do #77 serão calculados sobre uma base quebrada.

---

## 2. O que você vai construir — em ordem

### #77 — Peso por desfecho + pontuação (`score_pontos`)

**Alvo:** substituir o contador inteiro `tentativas_falha` por pontuação decimal.

**Colunas a adicionar via `ALTER TABLE` (nunca `DROP`):**

```sql
ALTER TABLE concierge_penalidades
  ADD COLUMN IF NOT EXISTS score_pontos   NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suspensao_ate  TIMESTAMPTZ NULL;
```

A coluna `tentativas_falha` **permanece intacta** — Regra 6 do CEO.

**Tabela de pesos (seção 3.1 da ARQUITETURA):**

| Desfecho | Evento Asaas | Peso |
|---|---|---|
| Cancelamento ativo | `PAYMENT_DELETED` | +1,0 |
| Expiração sem ação | `PAYMENT_OVERDUE` | +0,5 |
| Recusa de cartão | recusa de cartão | +0,25 |
| Estorno | `PAYMENT_REFUNDED` | +1,0 |
| Chargeback | `PAYMENT_CHARGEBACK_REQUESTED` | +2,0 |
| Pagamento concluído | `PAYMENT_PAID` | −1,0 (piso 0,0) |

**Função `registrarFalha` já aceita `eventId` obrigatório** (fix do #75).  
O `registrarPagamento` deve: `score_pontos = GREATEST(0, score_pontos - 1.0)`.

**Faixas (seção 3.2):**

| Score | Estado | Efeito |
|---|---|---|
| 0,0–0,9 | Normal | datas normais |
| 1,0–1,9 | Primeira quebra | +7 dias |
| 2,0–2,9 | Segunda quebra | +30 dias + aviso |
| ≥ 3,0 | Suspenso | `suspensao_ate = NOW() + INTERVAL '180 days'` |

`getPenalidade()` deve ler `score_pontos` e `suspensao_ate`, não só `tentativas_falha`.

---

### #78 — Janela, decaimento e retorno automático

**Decaimento:** job mensal — `score_pontos = GREATEST(0, score_pontos - 1.0)` em todo CPF sem incidente nos últimos 90 dias.

**Suspensão:**
- Dura 180 dias a partir do momento em que `score_pontos >= 3,0`
- Ao expirar: `suspensao_ate = NULL`, `score_pontos` volta para `2,0` (não zero)
- Job diário verifica `suspensao_ate <= NOW()` e faz o retorno

**Reset ao pagar:** parcial (`-1,0`). Nunca zera. Pagar uma vez apaga um abandono, não três.

---

### #79 — Verificação de identidade por código no canal

**Regra da ARQUITETURA (seção 4, invariante):**

> `registrarFalha()` **nunca** é chamado para um CPF cuja identidade não foi confirmada.

**Fluxo:**
1. Paciente abandona oferta Concierge
2. Sistema verifica se há Telegram ou WhatsApp vinculado ao CPF
3. Se sim: envia código de confirmação → só penaliza após código confirmado
4. Se não: abandono registra apenas na fricção por dispositivo (sem CPF)

**Contrato de resposta que o frontend já espera (seção 6.3):**
```typescript
export interface DeviceThrottleResult {
  allowed: boolean;
  remaining: number;
  throttled: boolean;           // teto antiautomação (50/dia)
  requiresVerification: boolean; // pede código do canal
  message?: string;
}
```

**Texto normativo (seção 7):**  
`"Para seguir com a reserva, confirme seu contato — enviamos um código para o seu WhatsApp."`

---

## 3. O que você NÃO deve fazer

1. Não mexa nas linhas 495 e 915 do `scheduling.ts` — guards de bloqueio, estão corretos
2. Não use `db push` — `concierge_penalidades` foi criada fora do Drizzle; #82 corrige isso
3. Não crie tabela nova fora do Drizzle — a exceção histórica é uma só
4. Não implemente o #80 — é do Dr. Manus, e a versão com "5 ofertas/IP" está revogada
5. Não marque nada CONCLUÍDO sem hash de commit + saída de teste colada

---

## 4. Como me reportar quando terminar

Toda entrega vem com quatro coisas, nesta ordem:

1. Hash do commit
2. Saída bruta do teste colada (não resumida)
3. Confirmação de que a planilha foi atualizada (abrindo a planilha, não por log)
4. Postagem no `#padaxor-projeto` com o hash

Sem os quatro, o item continua aberto.

---

## 5. O que você me entrega de volta

Após o #79:
- O Dr. Manus roda o #81-B (8 casos CPF + caso 21 guard + faixas)
- Só após #81-B verde o Dr. Manus começa o #80
- Só após #80 + #81-C verde eu faço o #84 (frontend `throttled`)

**Marco de lançamento (CEO):** após o passo #81-B, o Concierge pode receber paciente real.

---

— Dr. Replit Paxter  
Repositório: github.com/caio-padua/Protocolo-Manager  
ARQUITETURA: `docs/concierge/ARQUITETURA.md` (commit `eaeac11`)
