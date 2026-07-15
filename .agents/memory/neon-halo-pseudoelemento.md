---
name: Halo neon sem apagar relevo 3D
description: box-shadow nao e aditivo; animar halo direto num elemento com relevo 3D substitui o relevo
---

Regra: efeito de brilho/halo animado (neon respirando, glow) em elemento que ja tem `box-shadow` de relevo (btn-3d, bevel-3d) vai num pseudo-elemento `::after` (position:absolute; inset:0; border-radius:inherit; pointer-events:none), nunca animando `box-shadow` do proprio elemento.

**Why:** `box-shadow` nao e aditivo — a animacao substitui a pilha multi-camada do relevo 3D e o botao perde o bevel enquanto pulsa (reprovado pelo architect no Padrao 21).

**How to apply:** qualquer classe de halo nova (ex.: `.paxter-neon-breathe`) segue o modelo do Padrao 21 da skill-layout-paxter; incluir a variante `prefers-reduced-motion` tambem no `::after`.
