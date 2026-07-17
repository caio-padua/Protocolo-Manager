---
name: PARXIS wordmark e logo (parxis-site)
description: Decisoes de implementacao do logotipo PARXIS no site de marketing.
---

## Regra
- **Logo oficial**: PNG em `artifacts/parxis-site/public/brand/parxis-logo.png` (renderizado pelo ChatGPT em 17/07/2026 seguindo Manual Tecnico).
  - Fundo: bordô escuro (couro), funde naturalmente com `radial-gradient(... #2C0D10 ...)` no hero.
  - Exibir via `<img src="/parxis/brand/parxis-logo.png" />` — caminho absoluto com `/parxis/` prefixo.
  - Animação de respiro: `animation: symbol-breath 6s ease-in-out infinite` (definida em index.css).
- **Wordmark nav/footer**: CSS text com fonte `Michroma` (Google Fonts) + gradiente ouro 18K do Manual §6.
  - Michroma é uma fonte caps-only (sem glifos minúsculos). Texto misto (title-case) renderiza errado: "ClinICal" por fallback.
  - **Solução**: sempre chamar `.toUpperCase()` no JSX OU usar `text-transform: uppercase` no CSS.
  - Componente: `ParxisWordmark.tsx` — aceita `fontSize` prop (22=nav, 18=footer).
- **Paleta ouro (Manual §6)**: mais amarela/quente que o PAXTER.
  - `--parxis-gold-main: #F2B817` (ouro 18K principal)
  - `--parxis-gold-light: #FFD85A`, `--parxis-gold-medium: #D99000`
  - Gradiente 115deg: `#5B2C00 → #9A5700 → #F2B817 → #FFF3A6 → #FFD85A → #D99000 → #FFF0A0 → #B76C00 → #5B2C00`
- **Fundo** (Manual §15): `#050505` preto quase puro com `radial-gradient` bordô no hero e no CTA final.

**Why:** O CEO recebeu o PNG do ChatGPT como asset oficial — é o único wordmark/logo valido para o PARXIS (não recriar via CSS letra a letra). O símbolo monograma (RX dentro de quadrado arredondado) é idêntico ao PAXTER.

**How to apply:** Ao atualizar o parxis-site, sempre usar o PNG do Drive (caminho /parxis/brand/parxis-logo.png) para exibição grande e ParxisWordmark (CSS Michroma) para tamanhos pequenos/nav.
