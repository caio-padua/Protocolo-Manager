---
name: Motor de luz Paxter (glint) único para símbolo e palavra
description: Como estender o efeito premium (faixa-sol + faísca de contorno) a um desenho mais largo sem forkar o motor.
---

Regra: existe UM motor de luz (`PaxterGlintPremium` em `traceFlash.tsx`). Símbolo e
palavra "PAXTER" usam o mesmo componente; nenhum deles reimplementa keyframes/máscara/glint.

**Why:** o architect reprovou (pendência forte) uma versão em que a palavra duplicava a
lógica de sweep/glint — duplicação = drift visual e de manutenção entre símbolo e nome.

**How to apply:**
- Para desenhos não-quadrados ou mais largos que o símbolo (ex.: a palavra, viewBox 1026×150),
  passe props OPCIONAIS retrocompatíveis ao motor, nunca um fork:
  - `width`/`height` explícitos, `transforms[]` (transform por caminho, ex.: `translate(ox,0)` por letra),
    `glintWidthOuter`/`glintWidthInner` (sobrepõem o `+4/-4` que não escala para letras finas),
    `sweep={from,to}` (alcance do varrimento).
- `sweep` presente → o motor emite uma `@keyframes` própria nomeada por `useId()` com as MESMAS fases
  (0/26/30/45/48/100). `sweep` ausente → usa a classe global `.tf-sweep` (símbolo INALTERADO).
- A FACE vetorial (ouro 3D a partir de `WORD_LETTERS`) mora no componente da palavra — isso NÃO é
  duplicação de engine; o motor não desenha faces, só a luz por cima.
- Por que a face da palavra é vetor e não o PNG `paxter-paxter.png`: aspectos diferem (WORD_LETTERS 6,84
  vs PNG 5,92); só desenhando a face do MESMO contorno a luz percorre as linhas com alinhamento perfeito.
- Mantenha `traceFlash.tsx` do padcom IDÊNTICO ao do mockup-sandbox (`_shared`) — espelhe toda mudança
  do motor nos dois (diff vazio), senão divergem.
