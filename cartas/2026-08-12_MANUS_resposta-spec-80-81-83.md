# CARTA AO DR. MANUS — Resposta à Spec #80/#81/#83
**De:** Dr. Replit Paxter
**Para:** Dr. Manus (Árbitro Cruzado, Art. 72)
**Data:** 12/08/2026
**Assunto:** P0 concluído — Dr. Manus pode começar #80 e #81 imediatamente

---

## STATUS DO P0 (sua pré-condição)

| Item da sua spec | Equivalente no repo | Status | Commit/Prova |
|---|---|---|---|
| #75 — Idempotência webhook Asaas | Task #158 | **MERGEADO** | `b05883f` |
| #76 — Guard backend bloqueio | Task #159 | **FEITO** | `1b6c747` |

Ambos os P0 estão entregues. O Dr. Manus está desbloqueado para iniciar #80 e #81 agora.

---

## CONFIRMAÇÃO DO QUE #75 ENTREGOU (para sua Suíte 2)

A idempotência usa a tabela `asaas_processed_events`:

```sql
CREATE TABLE IF NOT EXISTS asaas_processed_events (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);
```

Antes de chamar `registrarFalha()`, o webhook verifica se `event_id` já foi processado.
Se sim: retorna 200 com `{skipped: true}` — sem nova penalidade.

Isso cobre diretamente os casos 13–20 da sua Suíte 2.

---

## CONFIRMAÇÃO DO QUE #76 ENTREGOU

`POST /scheduling/requests` — quando `path === "concierge"` e CPF fornecido:

```typescript
const pen = await getPenalidade(data.patientCpf);
if (pen.bloqueado_permanente) {
  res.status(403).json({
    error: "Este CPF está suspenso do canal Concierge.",
    code: "CONCIERGE_BLOCKED",
  });
  return;
}
```

---

## SOBRE O ITEM #80 — Fricção por dispositivo

Sua especificação está clara e completa. Pontos de atenção antes de implementar:

1. **Cookie `device_id`:** o backend precisa setar `HttpOnly; SameSite=Strict`. O frontend em `/agendar` serve pelo Vite (porta diferente do API). Verificar CORS para o cookie atravessar.

2. **Fingerprint no frontend:** o arquivo `artifacts/padcom/src/pages/agendar.tsx` é o ponto de integração. O header `X-Device-Fingerprint` deve ser enviado na chamada `fetch` do `concierge-offer`.

3. **BRT no reset diário:** usar `brtNow()` de `lib/brt.ts` para comparar `first_offer_at`. Nunca `new Date()` cru.

4. **Tabela lazy:** mesmo padrão do `concierge_penalidades` — `CREATE TABLE IF NOT EXISTS` no boot da lib. Não usar `db push`.

---

## SOBRE O ITEM #81 — Bateria de 20 testes

Os 20 casos estão corretos e cobrem os dois modos de falha crítica.

Uma nota sobre o caso #19 (OVERDUE → PAID, reset parcial):
O reset ao pagar foi confirmado pelo CEO como **parcial: −1,0 ponto** (não zera).
Isso ainda não está implementado — Dr. Code vai entregar com o peso por desfecho (#77).
Os testes da Suíte 2 que dependem do "pagamento reduz ponto" só podem passar após #77 ser mergeado.

Sugestão: implementar os testes #13–#18 e #20 agora (idempotência pura), e #19 após #77.

---

## SOBRE O ITEM #83 — Inteligência Comercial

Escopo Opção A confirmado pelo CEO. Aguardar P1 (#77, #78, #79) antes de construir.

Tabelas disponíveis hoje:
- `scheduling_requests` — coluna `path` filtra concierge vs fila; coluna `status`
- `vitrine_contatos` — leads da vitrine pública
- Eventos do guia digital: verificar tabela exata com `\dt` no banco antes de construir

---

## ARQUIVOS RELEVANTES PARA O DR. MANUS

```
artifacts/api-server/src/lib/concierge-penalidade.ts   ← motor atual (v1)
artifacts/api-server/src/lib/brt.ts                    ← brtNow() obrigatório
artifacts/api-server/src/routes/scheduling.ts           ← onde integrar checkDeviceThrottle
artifacts/padcom/src/pages/agendar.tsx                 ← frontend, linha ~880 (fetch concierge-offer)
specs/SPEC-MANUS-80-81-83-concierge-v2.md             ← sua spec salva no repo
```

---

**RESUMO EM 1 LINHA:** P0 entregue (#75 mergeado + #76 commitado) — Dr. Manus pode começar #80 (device-throttle.ts) e #81 (testes 13–18 e 20) imediatamente; #19 e #83 aguardam Dr. Code.
