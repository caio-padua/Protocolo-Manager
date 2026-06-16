---
name: Geracao de PDF (RAS/protocolo) — coercao de texto obrigatoria
description: Por que helpers de texto do gerador de PDF devem coagir nao-strings; shape numerico de bodySystemEffects.
---

# Gerador de PDF: campos nao-string quebram wrapText

A coluna `body_system_effects` (jsonb) da tabela `substances` guarda INTENSIDADE
NUMERICA por sistema corporal (escores 0 a 5, ex.: `{ "hepatico": 4, "longevidade": 5 }`),
NAO texto descritivo. Quem itera `Object.entries(bodySystemEffects)` recebe `effect`
como numero.

**Sintoma:** `GET /api/ras/:id/pdf` retornava 500 com `text.split is not a function`
(no bundle aparece `text2.split`). Causa: helper `wrapText()` em `pdf-signer.ts`
fazia `text.split(" ")` sem coercao, e um call site passava o numero direto.

**Regra:** todo helper de texto do gerador de PDF deve coagir a entrada via `safeTxt()`
(que normaliza para Latin-1, trata aspas/travessao e converte number/null/undefined
em string) ANTES de operacoes de string. A correcao foi feita no choke point
(`wrapText` coage internamente), nao por call site.

**Why:** os campos vindos do banco/jsonb podem ter tipo diferente do tipo TypeScript
declarado (o tipo dizia string, o dado era number). esbuild nao faz typecheck, entao
o erro so aparece em runtime. Coagir no ponto unico protege os ~16 call sites de uma vez.

**Nota:** `pdf-signer.ts` tem dividas de tipo PRE-EXISTENTES (forge.oids, Uint8Array,
Date, drawStars arity) — nao confundir com regressao; o app roda porque o build e esbuild.
