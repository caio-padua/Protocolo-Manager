---
name: CSS transform scale — distorção de preview
description: transform:scale() não afeta layout flow; causa distorção visual em previews de documentos (mm units vs escala visual diferente); fix com position:absolute dentro de wrapper de dimensões visuais exatas.
---

## Regra

CSS `transform: scale()` **não afeta o layout flow**. O div com `width: 794px` continua ocupando 794px de layout space mesmo visualmente reduzido. Resultado: overflow do container pai, layout quebrado, e gap/padding em `mm` parecem diferentes em escalas distintas.

**Why:** `mm` units são computados em pixels de tela (96dpi) no contexto de layout. Quando o container pai não é restrito ao tamanho visual, o layout muda proporcionalmente — a visual distorção não é por causa dos `mm`, mas por causa do container pai crescendo/encolhendo de forma não controlada.

**How to apply:** Para qualquer preview de documento com `transform: scale()`, usar o padrão:

```jsx
{/* Wrapper: footprint de layout = dimensões VISUAIS */}
<div style={{
  width: "calc(794px * 0.55)",
  height: "calc(1123px * 0.55)",
  position: "relative",
  overflow: "hidden",
}}>
  {/* Inner: full size, fora do fluxo de layout */}
  <div style={{
    position: "absolute", top: 0, left: 0,
    width: "794px",
    transform: "scale(0.55)",
    transformOrigin: "top left",
    pointerEvents: "none",
  }}>
    <DocumentPreview/>
  </div>
</div>
```

Isso elimina:
- Overflow/clipping não intencional
- Inconsistência visual entre preview pequeno (55%) e zoom (85%)
- O antigo `<div style={{ height: calc(Hpx * 0.55) }}/>` (spacer hack) — não é mais necessário

Aplicado no Designer do Receituário (preview 55% + modal zoom 85%).
