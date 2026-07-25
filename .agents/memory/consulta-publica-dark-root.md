---
name: Consulta pública — classe dark no root
description: Página pública (sem Layout/sidebar) que usa classes panel-3d/bevel-3d/concave-3d precisa de .dark no root div para ativar os dark variants; sem ela os painéis ficam claros e texto branco vira invisível.
---

## Regra

Toda página standalone (sem Layout) com fundo dark + classes 3D do Paxter **deve ter `dark` no root div**:

```tsx
<div className="dark min-h-screen flex flex-col" style={{ background: "..." }}>
```

**Why:** `.panel-3d`, `.bevel-3d-ok`, `.concave-3d` usam cores claras por padrão (cream/white).
Os dark variants (`.dark .panel-3d` etc.) vivem no index.css e são ativados somente quando
um ancestral tem a classe `.dark`. Sem isso, texto `rgba(255,255,255,0.88)` some sobre fundo claro.

**How to apply:** qualquer nova página pública (área do cliente, validação, receituário)
que rode fora do Layout — adicionar `.dark` no root antes de qualquer outra classe.

## Exemplo: página de validação de receituário

- Rota: `/consulta-receituario?token=TOKEN`
- Arquivo: `artifacts/padcom/src/pages/consulta-receituario/index.tsx`
- Root: `<div className="dark min-h-screen flex flex-col" style={{ background: "linear-gradient(180deg,#0d1a2d 0%,#07101f 100%)" }}>`
- Resultado: fundo navy escuro + painéis dark 3D + textos visíveis corretamente
