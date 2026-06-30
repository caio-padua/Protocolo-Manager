---
name: Grade de horarios fabricados (slice de pool)
description: Pool de horarios que alimenta dois cortes (Dia A=2, Dia B=3) precisa ter >= o maior corte, senao a contagem encolhe em silencio.
---

Quando uma grade fabricada deriva varios subconjuntos do MESMO pool por `slice(0, n)`
(ex.: Dia A = `pool.slice(0,2)`, Dia B = `pool.slice(0,3)`), cada pool tem de ter pelo
menos `max(n)` entradas. Se um periodo (manha/noite) tiver so 2 horarios, o corte
`slice(0,3)` devolve 2 e o requisito "Dia B sempre 3" quebra sem erro nenhum.

**Why:** o architect pegou exatamente isso: morning/evening tinham 2 itens; afternoon
tinha 3; o `.slice(0,3)` nao reclama de array curto, so devolve menos. Bug silencioso
de contagem, invisivel no typecheck e no caso default (que usava afternoon).

**How to apply:** ao gerar slots/chips a partir de pools fixos, garanta que TODO pool
tenha tamanho >= maior corte; valide cada ramo de preferencia (nao so o default) por
screenshot. Vale para qualquer grade curada "de cabeca".

Contexto: fluxo Dr. Caio (entrada "dr_caio") em agendar.tsx — a linha vermelha
"so horarios reais" foi REVOGADA pelo CEO SO para esse fluxo; horarios fabricados que
caem ~3 meses a frente (carencia escondida, prazo nunca exibido) sao intencionais ali.
O fluxo "assistente"/Corpo Clinico continua com horarios REAIS (useGetAgendaSlots).

**Preferencia de periodo MOLDA, nunca REDUZ (R7 da Revisao 2):** a grade do Dr. Caio
SEMPRE entrega 2 manha + 2 tarde. A preferencia de periodo so REORDENA os grupos
(periodo preferido aparece primeiro), nao filtra para um unico periodo. Implementado
como `fabricatedSlots.groups` (array ordenado), nao mais dois arrays fixos
morning/afternoon. **Why:** o architect reprovou quando `prefPeriod` nao influenciava
nada (so `prefWeekday` moldava a data); reduzir a oferta a um periodo contraria o R7.
**How to apply:** preferencia que "molda quando possivel" + "sempre N por categoria" =
reordenar/realcar, nunca cortar; e incluir a preferencia nas deps do useMemo.
