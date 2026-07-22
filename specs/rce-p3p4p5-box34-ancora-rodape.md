# Spec P3+P4+P5 — Boxes 3 e 4: fixados acima do rodapé

**Data:** 22/07/2026  
**Arquivo:** `artifacts/padcom/src/components/receituario/ReceituarioPreview.tsx`

## Alvo

Boxes 3 (Comprador) e 4 (Fornecedor) devem ficar FIXOS logo acima da linha do rodapé.
NÃO devem flutuar com a quantidade de prescrições no corpo do documento.

## Comportamento atual (ERRADO)

Boxes 3+4 estão no fluxo normal (`position: static`), então ficam empurrados para baixo
conforme o conteúdo das prescrições cresce. Com poucas prescrições ficam no meio da página;
com muitas, ficam perto do rodapé. Sem critério fixo.

## Solução

Usar `position: absolute` ancorado na borda INFERIOR da página, acima do rodapé:

```
┌────────────────────────────┐
│  Cabeçalho                 │
│  Título                    │
│  [Box 1]    [Box 2]        │  ← topo, fluxo normal
│                            │
│  Prescrições               │
│  (conteúdo livre)          │
│                            │
│  [Box 3]    [Box 4]        │  ← position: absolute, bottom fixo
│ ──────────────────────── ← │  ← linha do rodapé
│  Rodapé                    │
└────────────────────────────┘
```

### Implementação

O container do documento já tem `position: relative`.
O rodapé já usa `position: absolute; bottom: 8mm`.

Boxes 3+4:
```tsx
<div style={{
  position: "absolute",
  bottom: `${cfg.boxInferiorBottom}mm`,  // novo config, default 30mm
  left: "12mm",
  right: "12mm",
}}>
  <BandaComBoxes ... />
</div>
```

**`boxInferiorBottom`**: distância do fundo da página ao FUNDO dos boxes 3+4.
- Default: 30mm (rodapé em 8mm + altura do rodapé ~18mm + gap 4mm)
- Controlável via slider "Posição boxes 3+4"

## Config nova

```ts
boxInferiorBottom: number;   // mm da borda inferior ao fundo dos boxes 3+4; default 30
```

## Critério de aceitação

- Boxes 3+4 ficam imóveis independente da quantidade de prescrições
- Boxes 3+4 nunca se sobrepõem ao rodapé
- Slider controla a distância do fundo
