---
name: Anamnese V2 — LINHA VERMELHA e flush de rascunhos
description: Invariante das perguntas de alarme (nunca ocultas/recusaveis) defendida em camadas, e drenagem de respostas debounced antes de sair.
---

# LINHA VERMELHA (perguntas de alarme) — defesa em 3 camadas

Regra: pergunta com `eSinalAlarme=true` NUNCA pode ser ocultada, auto-avancada
nem recusada. Validar UI sozinha NAO basta — o backend e a fonte de verdade e o
banco pode ter recusas legadas/migradas.

**Como aplicar (todas as 3 camadas obrigatorias):**
1. UI: botao de recusar so aparece em bloco sem alarme (`podeRecusar`); auto-avanco
   no modo foco so quando `!q.eSinalAlarme`.
2. Backend escrita: `POST .../refusals` com `escopo="bloco"` consulta o questionario
   e responde 409 se o bloco contem qualquer pergunta de alarme.
3. Backend leitura (defensiva): `loadState` calcula o conjunto de blocos com alarme
   e FILTRA recusas orfas/legadas antes de devolver. Sem isso, uma linha antiga em
   `anamnese_refusals` reintroduz o bypass mesmo com a camada 2 ativa.

**Why:** o architect reprovou a 1a entrega justamente porque so a camada 2 existia;
dado migrado driblava a invariante. Guardar a barreira so na escrita e insuficiente.

---

# Flush de respostas com debounce antes de concluir/sair

Respostas de texto/numero sao salvas com debounce (~800ms). Isso perde a ultima
resposta se o usuario conclui ou sai antes do timer.

**Como aplicar:**
- Manter um mapa `pending` de rascunhos; ao concluir, `await flushPending()`
  (mutateAsync) ANTES de chamar `complete`.
- Para saida/reload/troca de aba: `flushBeacon()` com `fetch(..., keepalive:true)`
  ligado a `pagehide`, `visibilitychange`(hidden) e ao cleanup do `useEffect`
  (desmontagem). `keepalive` sobrevive ao unload; `sendBeacon` so faz POST, entao
  para endpoint PATCH use `fetch keepalive`.

**Why:** limpar apenas os timers no unmount (sem drenar) ainda perde o rascunho;
foi o 2o motivo do FAIL do architect.

---

# Validacao do valor (JSONB) por uniao discriminada

O `valor` da resposta e JSONB livre. Validar com `z.discriminatedUnion("tipo", ...)`
(boolean/single/multi/escala/number/texto) blinda o banco E o adapter de achados.
O adapter `anamnese-findings-adapter.ts` NUNCA importa `motor-anamnese.ts` (linha
vermelha de arquitetura — motor real e onda futura).
