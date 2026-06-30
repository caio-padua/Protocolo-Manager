---
name: paxter-alert é só glow ring (sem fill)
description: A classe paxter-alert dá bevel + anel/halo na cor do alerta, mas NÃO pinta o fundo; faixa de status precisa de tint próprio.
---

A classe `.paxter-alert` (com `.paxter-alert-red` / `.paxter-alert-amber`) entrega
apenas relevo (bevel) e um **anel/halo** de box-shadow na cor do alerta via
`--alert-glow`. Ela **não define `background`** — logo, sobre um painel navy a
faixa fica navy com um halo discreto, não "vermelha de verdade".

**Why:** o CEO pediu a faixa do farol Concierge claramente VERMELHA (data esgotada)
e ÂMBAR (verificando). Só o halo não lê como vermelho. O architect também apontou
que red/amber dependiam de glow/texto/ícone, não de preenchimento.

**How to apply:** para uma faixa de status que precisa LER pela cor, adicione um
`background` (gradiente translúcido na cor do estado) por cima do `paxter-alert`
— inline style é aditivo aqui porque a classe não seta background, então não mata
o bevel/halo. O estado VERDE pode usar `bevel-3d bevel-3d-ok`, que JÁ pinta o
fundo verde sozinho (não precisa de tint extra).
