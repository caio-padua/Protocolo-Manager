# CARTA AO DR. CODE
**De:** Dr. Replit Paxter
**Para:** Dr. Code (Claude Code)
**Data:** 12/08/2026
**Assunto:** Handoff — Trava de Escassez do Concierge implementada + próximos passos

---

## 1. O QUE FOI ENTREGUE HOJE

A **trava de escassez do Concierge** foi construída de ponta a ponta nesta sessão.
O sistema penaliza clientes que cancelam ou abandonam pedidos Concierge sem pagar.

### Tabela de penalidades

| Falhas acumuladas | Efeito nas datas |
|---|---|
| 0 | Oferta normal |
| 1 | Datas +7 dias no futuro |
| 2 | Datas +30 dias no futuro |
| 3 ou mais | `bloqueado_permanente = true` — tela "Ir para a Via Comum" |

### Arquivos criados/modificados

| Arquivo | O que é |
|---|---|
| `artifacts/api-server/src/lib/concierge-penalidade.ts` | Motor puro: `getPenalidade(cpf)`, `registrarFalha(cpf)`, `calcularPenalidadeDias(n)` |
| `artifacts/api-server/src/routes/scheduling.ts` | GET `/scheduling/concierge-offer?cpf=` aplica offset; hook de polling quando status vira `expirado`/`cancelado` |
| `artifacts/api-server/src/routes/asaas.ts` | Hooks em `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED` |
| `artifacts/padcom/src/pages/agendar.tsx` | Painel vermelho de bloqueio permanente; banner âmbar de penalidade progressiva |

### Tabela no banco (criada lazy — sem Drizzle schema)

```sql
CREATE TABLE IF NOT EXISTS concierge_penalidades (
  id SERIAL PRIMARY KEY,
  cpf TEXT NOT NULL UNIQUE,
  tentativas_falha INTEGER DEFAULT 0,
  bloqueado_permanente BOOLEAN DEFAULT FALSE,
  ultima_falha_at TIMESTAMPTZ,
  criado_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tasks mergeadas nesta sessão

| Task | O que foi | Commit |
|---|---|---|
| #144 | Testes da trava de escassez | `312f507` |
| #146 | Painel CEO para ver/resetar penalidades | `9bed3c5` |
| #149 | Reset CEO de ponta a ponta | `9305755` |
| #150 | Audit log ao resetar penalidade | `75a0469` |
| #151 | CPF não pedido duas vezes no reset | `92421b2` |
| #152 | Webhook Asaas dispara penalidade | `b05883f` |
| #157 | PAYMENT_CHARGEBACK_REQUESTED também penaliza | `ee99e8f` |

---

## 2. DECISÕES EM ABERTO — PRECISA DE VALIDAÇÃO

### Decisão A — Reset automático ao pagar?

**Pergunta:** quando o cliente paga o Concierge com sucesso, as `tentativas_falha` devem ser zeradas?

**Situação atual:** penalidade é permanentemente acumulada — pagar não zera.

**CEO ainda não confirmou.** Verificar antes de tocar em `finalizeConciergeBooking`.

### Decisão B — Idempotência do webhook Asaas (Task #158)

**Problema:** um mesmo evento do Asaas pode chegar mais de uma vez (retentativa do servidor deles).
Sem idempotência, cada reenvio aplica uma nova penalidade ao mesmo CPF.

**Solução proposta (Kaizen K-003):** adicionar coluna `penalidade_registrada BOOLEAN` em `scheduling_requests` e verificar antes de incrementar.

**Status:** Task #158 em andamento (agentes em paralelo).

---

## 3. TASKS ABERTAS RELEVANTES PARA O DR. CODE

| Task | Status | O que é |
|---|---|---|
| #153 | IN_PROGRESS | Penalidade do Concierge no histórico do paciente |
| #154 | IN_PROGRESS | Confirmar reset via modal de ponta a ponta |
| #155 | PROPOSED | Botão de histórico não travar com CPF errado |
| #156 | PROPOSED | Substituir `prompt()` pelo PaxterClientSelector canônico |
| #158 | IN_PROGRESS | Idempotência do webhook Asaas (sem penalidade duplicada) |
| #159 | PROPOSED | Confirmar que bloqueado não consegue reservar via Concierge |
| #160 | PROPOSED | Nome do paciente ao lado do CPF na tela de penalidades |
| #161 | IN_PROGRESS | Chargeback de pagamento comum não aplica penalidade |
| #162 | PROPOSED | CEO vê nome do paciente ao lado do CPF mascarado |
| #163 | PROPOSED | Reset falha quando CPF digitado não bate com o cliente |
| #164 | PROPOSED | CHARGEBACK sem sreq vinculado não aplica penalidade |
| #165 | PROPOSED | Limpar tabela de idempotência periodicamente |

---

## 4. PRÓXIMOS 5 PASSOS RECOMENDADOS (em ordem)

### Passo 1 — Fechar idempotência do webhook (#158)

```typescript
// em asaas.ts, antes de registrarFalha():
const sreq = await db.query.schedulingRequests.findFirst({
  where: and(
    eq(schedulingRequests.id, sreqId),
    eq(schedulingRequests.penalidade_registrada, false)
  )
});
if (!sreq) return res.json({ ok: true, skipped: 'already_penalized' });

await db.update(schedulingRequests)
  .set({ penalidade_registrada: true })
  .where(eq(schedulingRequests.id, sreqId));

await registrarFalha(cpf);
```

### Passo 2 — Nome do paciente na tela de penalidades (#160, #162)

A rota `GET /api/concierge-penalidades` deve fazer JOIN com `clients` por CPF e retornar `nome_cliente`. O front exibe ao lado do CPF mascarado.

### Passo 3 — Bloquear reserva no backend (#159)

Atualmente o bloqueio é apenas visual (frontend). O backend `POST /scheduling/concierge-request` precisa checar `getPenalidade(cpf).bloqueado` antes de criar o sreq.

### Passo 4 — PaxterClientSelector na tela de penalidades (#156)

Substituir o `prompt()` atual pelo componente canônico.
Skill em: `.agents/skills/skill-paxter-client-selector/SKILL.md`

### Passo 5 — Histórico do paciente (#153)

A tela do cockpit do paciente (`/cockpit/:id`) deve exibir um bloco de penalidades com data, tipo de falha e quem resetou.

---

## 5. KAIZENS ABERTOS

| Kaizen | O que é | Prioridade |
|---|---|---|
| K-001 | Atualizar schema OpenAPI para incluir `cpf` em `concierge-offer` e voltar ao hook gerado | Baixa |
| K-002 | Extrair hook `useConciergeOffer(cpf)` para arquivo separado | Baixa |
| K-003 | Coluna `penalidade_registrada` em `scheduling_requests` | Alta (idempotência) |
| K-004 | Tela `/inteligencia` unificando funil concierge + vitrine-leads + guia digital | Média |
| K-005 | Limpar tabela `concierge_penalidades_eventos` (idempotência) periodicamente | Baixa |

---

## 6. COMO AUDITAR O QUE FOI FEITO

```bash
# Ver commits desta sessão
git log --oneline 1c8d16e..HEAD

# Testar o motor de penalidade
curl -s "$API/scheduling/concierge-offer?cpf=12345678900" | jq

# Ver penalidades no banco
psql $DATABASE_URL -c "SELECT * FROM concierge_penalidades ORDER BY ultima_falha_at DESC LIMIT 10;"

# Testar webhook Asaas (dispara penalidade)
curl -X POST "$API/webhooks/asaas" \
  -H "Content-Type: application/json" \
  -d '{"event":"PAYMENT_OVERDUE","payment":{"id":"pay_test","externalReference":"sreq_123"}}'
```

---

## 7. REGRAS INVIOLÁVEIS DO CEO (relembrar antes de codar)

1. **Nunca DROP/TRUNCATE** — só ADD COLUMN, nunca DROP COLUMN.
2. **Tela obsoleta = fora do menu, arquivo intacto.**
3. **Decisão do CEO não se muda sem aviso explícito.**
4. **Penalidade é acumulada permanentemente** (pagar não zera — até CEO confirmar o contrário).
5. **Tabela `concierge_penalidades` foi criada lazy** (fora do Drizzle schema) — não fazer `db push`.

---

**RESUMO EM 1 LINHA:** Trava de escassez do Concierge entregue de ponta a ponta; os próximos passos são fechar idempotência (#158), nome do paciente (#160), bloqueio no backend (#159) e PaxterClientSelector (#156).
