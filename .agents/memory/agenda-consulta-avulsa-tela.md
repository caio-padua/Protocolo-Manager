---
name: Agenda — tela da consulta avulsa
description: Contrato da tela de marcação avulsa na Agenda Diária (grade, botão, diálogo) e armadilhas de teste/codegen
---
- Início da consulta tem de cair num período do motor da agenda (GET /agenda/slots); o arraste é ajustado ao período que o contém, com aviso visível. Duração é livre (5–480), padrão = período da agenda.
- Pré-checagem de conflito na tela é só informativa; o servidor (409/404) decide. Resultado sem status ou 5xx = INCERTO: nunca repetir sozinho, só "Conferir na agenda".
- Agenda, profissional, modalidade e local são campos separados vindos do cadastro da agenda (GET /agenda/resources devolve professionalName/locationName); nada é inferido.
- Toque e segure: só trava a rolagem DEPOIS do segure valer (ouvinte touchmove não passivo); segure sem mover = clique (fim nulo), nunca arraste de 5 minutos.

**Why:** evitar duplicar consulta/evento Google e não confundir agenda com local.
**How to apply:** mexeu na grade ou no diálogo, rode e2e/agenda-consulta-avulsa.spec.ts (viewport alto no desktop: layout desloca com dados carregados; esperar evento da grade antes de medir coordenadas; mobile usa UMA sessão CDP para touchStart/End).
- Depois de `pnpm run codegen` em lib/api-spec: reescrever lib/api-zod/src/index.ts só com `export * from "./generated/api";` e rodar `pnpm run typecheck:libs`.
