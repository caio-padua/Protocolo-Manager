---
name: Pivot visual navy/gold (PAWARDS) — regras duraveis
description: Regras de cor/contraste e linha-vermelha aprendidas no pivo de identidade do PADCOM para azul-marinho/dourado.
---

# Pivot navy/gold — regras duraveis

Regra: o dourado (token `accent`, hsl(39 41% 51%)) tem contraste FRACO para texto/icone pequeno sobre fundo branco. Use dourado SO em borda/anel/fundo/gradiente/badge (`border-accent`, `ring-accent`, `bg-accent`, `to-accent`, ou `bg-accent text-accent-foreground`). Para texto e icone use `text-primary` (marinho) ou `text-foreground`.
**Why:** review do architect reprovou microtexto em `text-accent` (falha de legibilidade, ~2.6:1). Os componentes shadcn `ui/*` ja usam corretamente `bg-accent text-accent-foreground` (dourado de fundo + texto escuro = alto contraste) — nao mexer.
**How to apply:** ao tematizar telas, ao trocar ciano/teal antigo por dourado, NUNCA aplicar `text-accent` em label/icone pequeno; converter para `text-primary`.

Regra: cor de SUBSTANCIA e de SISTEMA CORPORAL e DADO (identidade do item), nunca padronizar. Distinga fallback de PAYLOAD vs fallback de RENDER:
- Fallback no `onSave`/payload (ex.: `SubstanceEditSheet`) e PERSISTENCIA — mexer nele viola a linha vermelha; manter o literal original.
- Fallback so de render (ex.: `VitrineCard` Ampola SVG / `borderLeftColor`) NAO toca o dado (campo segue null); trocar a cor default de exibicao e aceitavel e pode acompanhar o pivo.
**Why:** o architect (1a passada) flagou `color: ... ?? "#16294a"` no onSave como ALTA por mudar o que e gravado quando a substancia nao tem cor.
**How to apply:** antes de trocar qualquer hex de cor de item, checar se a linha alimenta `payload`/`onSave`/mutation (persistencia → reverter ao original) ou so `style`/SVG (render → pode mudar).

Regra: o acabamento "de grife" (creme/dourado + serifada) vive na BASE do `index.css`, nao tela a tela. `--app-font-display` foi desenhado para SER a serifada (h1/h2/h3, `.pw-title-serif`, `.pw-client-name` herdam dele); botoes/rotulos usam sans (Inter/Archivo), nao display, entao nao viram serif. Para ativar a grife: trocar `--app-font-display`/`--app-font-serif` + os tokens de cor frios + os gradientes das classes 3D base (panel-3d, bevel-3d, concave-3d, screen-3d, field-engraved, btn-3d-soft) para os MESMOS valores do `.pw-home`.
**Why:** o creme/dourado nascia preso ao escopo `.pw-home` (so o Dashboard) e o display apontava provisoriamente para Archivo; elevar tudo a base padroniza todas as telas de uma vez e torna `.pw-home` redundante.
**How to apply:** ao padronizar o visual global, editar os tokens/classes base e manter parity byte-a-byte com `.pw-home`; se houver override identico no `.pw-home`, ele pode ser removido (redundante).
