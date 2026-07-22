# Spec P9 — Boxes 3+4 aparecem/somem conforme tipo de receituário

**Data:** 22/07/2026  
**Arquivo:** `artifacts/padcom/src/components/receituario/ReceituarioPreview.tsx`

## Alvo

- `tipoReceitaPadrao === "especial"` → boxes 3 e 4 VISÍVEIS
- `tipoReceitaPadrao === "simples"` → boxes 3 e 4 OCULTOS

## Situação atual

Já implementado com `{cfg.tipoReceitaPadrao === "especial" && <BandaComBoxes.../>}`.
**Porém**: com a mudança do P3+P4+P5 (position: absolute), o container absoluto
precisa ser o que é condicional — não apenas a banda interna.

## Implementação

```tsx
{cfg.tipoReceitaPadrao === "especial" && (
  <div style={{
    position: "absolute",
    bottom: `${cfg.boxInferiorBottom ?? 30}mm`,
    left: "12mm", right: "12mm",
  }}>
    <BandaComBoxes
      cfg={cfg} ...
      leftRows={compradorRows}
      rightRows={fornecedorRows}
      rightContentAlign="bottom"
    />
  </div>
)}
```

## Critério de aceitação

- Toggle "ESPECIAL" → boxes 3+4 aparecem na posição correta acima do rodapé
- Toggle "COMUM" → boxes 3+4 desaparecem completamente, espaço do rodapé limpo
- A presença/ausência é imediata no preview
