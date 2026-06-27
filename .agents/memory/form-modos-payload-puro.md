---
name: Formulário com modos (Simples/Completo) — payload puro por modo
description: Em form com modos, esconder a UI não basta; o submit deve gatear os campos por modo, senão valores pré-preenchidos de outro modo vazam.
---

# Formulário com modos — payload puro por modo

Quando um formulário tem modos (ex.: Cadastro Simples x Completo) e a spec diz que o modo
mínimo envia só os campos dele, **gatear a renderização dos painéis não é suficiente**: o
`handleSubmit` precisa condicionar o `append`/envio dos campos de outro modo por `mode === "..."`.

**Why:** campos ocultos podem estar **pré-preenchidos** (ex.: `pais` default "BRASIL", `instagram`,
`comoConheceu`, `locationId` vindos do prefill do cliente). Como o estado é único e compartilhado
entre os modos, esses valores continuam no state mesmo com o painel escondido e vazam no payload.
O architect reprova como quebra de spec (envio do modo mínimo deve ir vazio/não enviado).

**How to apply:** ao revisar/escrever submit de form com modos, envolva os campos exclusivos de um
modo em `if (mode === "completo") { ...append... }` e adicione `mode` às deps do `useCallback`.
Animações/CTA com tempo definido em spec (ex.: convite ~1,2s) seguem a spec à risca; não inflar a
duração "para dar tempo de ler" — o destaque persistente (toggle glow) é quem carrega a legibilidade.
