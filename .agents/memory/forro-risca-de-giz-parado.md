---
name: Forro risca de giz parado + painéis oficiais
description: regra do terno (.leva-fabric) em fundo de página e painéis da área do cliente; ancoragem no celular
---
O forro de risca de giz NUNCA anda: em fundo de página inteira usar `leva-fabric leva-fabric-fixo` (position fixed). Só os painéis rolam.
**Why:** o Dr. Caio reclamou que o forro rolava junto (era position absolute dentro do container que rola).
**How to apply:** cabeçalho, rodapé e cartão usam só `leva-fabric` (ficam dentro do painel). Páginas já com `-fixo`: área do cliente (logada e login), receituário, login, guia digital, páginas Clerk. Anamnese já é `fixed inset-0`. Nunca criar override de risca por tela: é o padrão único do index.css.
Painéis internos da área do cliente = `panel-3d-sub`; canais/selos = `bevel-3d` (+ cor semântica só em background/borda/texto, como bevel-3d-ok); botões pequenos = `btn-3d-soft`. Não inventar relevo próprio.
Celular (iPhone): barra inferior com `touch-action: pan-x` + `overscroll-behavior: contain` para não deslocar a tela; margem inferior `env(safe-area-inset-bottom)+14px`.
