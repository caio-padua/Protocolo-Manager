---
name: Anamnese cliente pele escura (Lora + selecao ouro)
description: Graduacao do mockup escuro p/ /anamnese/v2 — fonte Lora na pergunta, painel navy misto, selecao OURO (nao ciano), e a armadilha mockup x spec.
---

- Pele escura da anamnese do cliente (`/anamnese/v2`) graduada do mockup `anamnese-escura/FonteLora` (24/06/2026). O detalhe de design (cores/classes) vive na skill `skill-layout-paxter` secoes 2.1/2.2 — essa skill e a fonte-da-verdade, nao a memoria.
- EXCECAO de design registrada: nesta tela a SELECAO de resposta usa OURO (anel + rotulo), nao o ciano padrao "foco/atual" do design system. O anel de FOCO de teclado continua ciano. Nao "consertar" trocando ouro->ciano achando que e bug.
  **Why:** decisao estetica aprovada pelo CEO para a leitura do cliente; o architect ja flagou como desvio consciente do "ciano = foco".
- Painel escuro = navy "misto" CHAPADO, SEM vidro/backdrop-filter. Uma onda anterior deixou o painel em VIDRO com um comentario que MENTIA dizendo "misto suavizado". O comentario nao prova o codigo — conferir a regra real.
- Fonte Lora (serifa) reservada SO a pergunta (`.leva-q`); nunca em rotulo KPI/botao/dado.

**Armadilha mockup x spec (durable):** o shell `levaAnamnese.tsx` tinha o botao Gravar em CIANO, mas a spec escrita (`specs/anamnese-escura-graduacao.md` item 3 + T1) pedia Gravar OURO `#f0c674`. Segui a SPEC.
  **Why:** mockup pode ficar desatualizado; o contrato escrito vence quando os dois divergem.
  **How to apply:** ao portar visual de mockup -> tela real, conferir cada cor contra a spec; divergencia = flagar ao CEO, nunca adivinhar em silencio.
