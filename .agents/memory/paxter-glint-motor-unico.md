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
  do motor nos dois (diff vazio), senão divergem. Estender a palavra SO consumindo as props existentes
  (não tocar o motor) NÃO exige espelhamento — só mudança no `traceFlash.tsx` exige.

**RASTER (PNG) ≠ vetor — não force o motor SVG numa imagem.** Quando a FACE da marca é a arte
oficial raster (sem paths), NÃO reuse o motor SVG de glint: ele recorta a luz pelos paths potrace
ondulados e os raios saem serrilhados ("carcomido nos raios"). Use o padrão `.symbol-glint`: faixa
de luz CSS por cima da imagem, recortada pela própria arte LIMPA via `mask-image` + `mix-blend:screen`.
A máscara é SEMPRE a versão clean (inclusive no escuro), p/ a luz não vazar na sombra embutida da arte
oficial. Mantenha o MESMO ciclo e as MESMAS fases do símbolo e do subtítulo, senão a luz deriva e pisca
irregular. **Why:** trocar a face vetorial pela arte oficial matou a luz junto; ela tinha de voltar
sem reintroduzir o serrilhado.

**TEXTO ≠ vetor — não force o motor SVG numa frase.** A frase "CLINICAL INTELLIGENCE SYSTEM" é texto
HTML, não um contorno vetorial; o motor de glint (que percorre `d`/paths) não se aplica. Use
`PaxterTextShimmer.tsx`: base sólida sempre visível (`color`) + camada de luz dourada recortada no
texto (`background-clip:text`, `mix-blend-mode:screen`, `opacity` animada) varrendo na MESMA cadência
(12s, fases 0/26/30/45/48/100), com `@media (prefers-reduced-motion: reduce)` ocultando a luz.
**Fallback funcional é "sem brilho", nunca "sem texto"** (regra paxter-botoes-validados): a base sólida
fica embaixo; se o shimmer falhar (Safari/Firefox com background-clip/mix-blend), o texto continua legível.
CSS namespeado por `useId()` (sem vazamento global).
