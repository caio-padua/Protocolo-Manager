# Spec P4 — Paxter 3D Visual (skill-layout-paxter compliance)

**Data:** 20/07/2026
**Tela alvo:** `artifacts/padcom/src/pages/configuracoes/receituario.tsx`

## Regra mãe
Toda tela do Manager usa o vocabulário 3D da skill-layout-paxter.
Pivot navy/ouro: teal-600 → classes btn-3d/bevel-3d (já reapontadas para navy/ouro em index.css).

## Mudanças por componente

### Section (accordion)
- Wrapper: `border border-gray-200 rounded-lg bg-white` → `panel-3d rounded-none` (radius 6px já está no panel-3d)
- Header button: adicionar `hover:bg-transparent` e texto navy (text-[var(--navy)])
- Badge: `bg-teal-100 text-teal-700` → `screen-3d text-xs px-2 py-0.5`
- Ícone: `text-teal-600` → `text-[var(--gold)]` (dourado, cor de acento Paxter)

### FieldRow
- Label: manter uppercase tracking-wider, cor navy

### ModoToggle
- Container: `border border-gray-300 rounded overflow-hidden` → `concave-3d overflow-hidden`
- Botão ativo: `bg-teal-600 text-white` → `bevel-3d text-white`
- Botão inativo: `bg-white text-gray-500` → fundo neutro dentro do concave

### Botões Salvar / Imprimir
- Salvar: `bg-teal-600` → `btn-3d` (já é navy/ouro via CSS)
- Salvo: `bg-green-600` → `bevel-3d-ok` (já verde OK)
- Imprimir: `variant="outline"` → `btn-3d-soft`

### Zona de drag (upload de faixa)
- `border-2 border-dashed rounded-xl bg-gray-50` → `concave-3d border-2 border-dashed`
- Hover: ciano (accent) mantido

### Header da tela
- `bg-white border-b border-gray-200` → fundo navy escuro, texto branco
- Ícone: dourado

### Info box (bg-blue-50)
- `bg-blue-50 border-blue-200` → `screen-3d` (já cinza-elevado)

### Subgrupos internos (Kaizen A/B boxes)
- `border border-gray-200 rounded-lg bg-gray-50` → `panel-3d-sub`

### Botões de seleção de opção (simples/dupla/ornamentada, 50/50/40/60 etc.)
- Ativo: `bg-teal-600 text-white border-teal-600` → `bevel-3d`
- Inativo: `border-gray-300 text-gray-500` → `btn-3d-soft`

### Inputs
- Classe base do Input shadcn → adicionar `field-engraved` no className

### Seletor de visível/oculto / ativado/desativado (pill toggle)
- `rounded-full font-bold border` ativo: `bevel-3d-ok` ou `bevel-3d`
- Inativo: `btn-3d-soft text-gray-500`

## O que NÃO muda
- ReceituarioPreview.tsx: inline styles de documento — correto, não deve ter visual Paxter
- Lógica de config, patch, upload, print
