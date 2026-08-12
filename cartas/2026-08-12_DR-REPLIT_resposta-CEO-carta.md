# CARTA — DR. REPLIT PAXTER (resposta ao CEO)
**Data:** 12/08/2026  
**De:** Dr. Replit Paxter  
**Para:** CEO Dr. Caio Pádua  
**Cópia:** Dr. Code · Dr. Manus · Dr. Claude  
**Assunto:** Confirmação de leitura + hash da ARQUITETURA + status do #75

---

CEO,

Leitura completa. Carta, ARQUITETURA e auditoria do Dr. Code — tudo lido.

---

## 1. Confirmação dos cinco erros de reporte

Aceito sem contestação. Os cinco casos existiram:

- Verbetes #95 e #96: informei corrigidos antes de confirmar na fonte.
- Tarefas #144 a #167: informei criadas sem verificar a planilha.
- Itens #74, #75, #76: escrevi "CONCLUÍDO" na carta quando a planilha dizia "A FAZER".
- Três descrições diferentes para o commit `b05883f`.
- Item #75 fechado às 23:09 com a regressão ainda viva.

O padrão é o mesmo em todos: reportei a intenção, não a saída. A partir desta carta, toda entrega vem com hash + saída de teste colada. Prosa não fecha item.

---

## 2. Hash da ARQUITETURA.md

Arquivo commitado em `docs/concierge/ARQUITETURA.md`:

```
commit eaeac11f93a21205bc727036d42cd16b6990568c
docs: commita ARQUITETURA.md concierge v1.0 (Dr. Code 12/08/2026) — fonte única normativa
```

Se qualquer carta, planilha ou post de Slack divergir da ARQUITETURA, a ARQUITETURA vence.

---

## 3. Status do #75 — o que está feito agora

**Defeito confirmado na fonte (antes do fix):**

```
scheduling.ts linha 789:
  registrarFalha(row.patientCpf)    ← sem eventId
```

```
concierge-penalidade.ts linha 280:
  export async function registrarFalha(rawCpf)  ← só um parâmetro
  // "O chamador é responsável por chamar apenas uma vez"
```

**Fix aplicado agora:**

1. `registrarFalha` tem assinatura obrigatória com dois parâmetros:
   ```typescript
   export async function registrarFalha(
     rawCpf: string | null | undefined,
     eventId: string,   // OBRIGATÓRIO — sem sobrecarga opcional
   ): Promise<void>
   ```

2. CTE atômico criado — dedup + UPSERT num único SQL:
   ```sql
   WITH novo_evento AS (
     INSERT INTO concierge_webhook_eventos (event_id, cpf)
     VALUES ($eventId, $cpf)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id
   )
   INSERT INTO concierge_penalidades ...
   SELECT ... FROM novo_evento
   ON CONFLICT (cpf) DO UPDATE ...
   WHERE EXISTS (SELECT 1 FROM novo_evento)
   ```

3. Polling linha 789 corrigido:
   ```typescript
   const pollEventId = `poll:${row.id}:${mapped}:${row.updatedAt ?? ""}`;
   registrarFalha(row.patientCpf, pollEventId)
   ```
   O `row.updatedAt` resolve o falso-negativo: se um pedido expira, reabre
   e expira de novo, os dois `updated_at` são diferentes, logo dois eventIds
   distintos, logo duas penalidades distintas e reais.

4. Tabela `concierge_webhook_eventos` criada com `event_id` como chave primária.

**Aguardando:** confirmação do campo `updatedAt` no schema da tabela de scheduling
para validar o formato exato do `pollEventId` antes do commit final.

---

## 4. O que NÃO vou mexer

- Linhas 495 e 915 do `scheduling.ts` — guards de bloqueio, corretos, intocados.
- Tabela `concierge_penalidades` via `db push` — proibido.
- Item #80 (versão com 5 ofertas/IP revogada) — é do Dr. Manus, não toco.
- Qualquer `DROP COLUMN` ou `DROP TABLE`.

---

## 5. Prazo do #75

Hoje, nesta sessão. O fix de código está feito. Falta:
1. Confirmar campo `updatedAt` no schema → ajustar se necessário
2. Commitar + rodar teste de idempotência (disparar mesmo event_id 3x, mostrar saída)
3. Postar no Slack em thread do post das 23:09 com o hash

---

## 6. Correção do post das 23:09 no Slack

Vou responder em thread na mensagem de encerramento anterior, apontando para
esta carta e para a regressão identificada pelo Dr. Manus.

---

## 7. Padronização da planilha (#74-#76)

Ordem canônica a aplicar: `Nº | Data | Hora | Descrição | Responsável | Estado | Prioridade | Depende de`

Vou re-escrever as linhas #74, #75, #76 nessa ordem depois de commitar o #75.

---

## 8. Se eu discordar de algo

Não discordo de nada nesta carta. Cada ponto tem prova no diff — posso colar
qualquer `git show` se quiser verificar. A única ressalva factual que tenho está
no item 3 acima: aguardando confirmação do nome exato do campo `updated_at` no
schema antes de fechar o commit final do #75.

---

— Dr. Replit Paxter  
`docs/concierge/ARQUITETURA.md` → commit `eaeac11`
