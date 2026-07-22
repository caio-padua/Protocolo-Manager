# Spec P0 — FieldLine Manuscrito: label em cima, linha embaixo

**Data:** 22/07/2026  
**Arquivo:** `artifacts/padcom/src/components/receituario/ReceituarioPreview.tsx`  
**Função:** `FieldLine` (modo `manuscrito: true`)

## Alvo

O CEO confirma: o layout correto para campos manuscritos (boxes 3 e 4) é:

```
NOME           ← label pequeno uppercase no TOPO
[espaço para escrever à mão]
─ ─ ─ ─ ─ ─   ← linha pontilhada na borda INFERIOR (como sublinhado)
```

Isso é padrão de formulário impresso: você lê o label, escreve no espaço, a linha é o "chão" da escrita.

## O que está errado hoje

```tsx
// ERRADO — linha no topo com borderTop:
<span style={{ borderTop: "0.6px dashed #bbb", minHeight: 11 }}/>
<span>NOME</span>
```

Visual errado:
```
─ ─ ─ ─ ─ ─   ← topo (ERRADO)
[espaço]
NOME           ← bottom
```

## Solução exata

```tsx
// CORRETO — label no topo, linha na borda inferior:
<div style={{ display: "flex", flexDirection: "column", marginBottom: 5, gap: 1 }}>
  <span style={{
    fontWeight: 700, color: "#aaa",
    fontSize: 5, letterSpacing: 0.7,
    textTransform: "uppercase",
  }}>{label}</span>
  <span style={{
    borderBottom: "0.6px dashed #bbb",
    display: "block",
    minHeight: 11,
  }}/>
</div>
```

Visual correto:
```
NOME           ← label (topo)
[11px espaço para escrever]
─ ─ ─ ─ ─ ─   ← borderBottom (chão)
```

## Critério de aceitação

- Label aparece ACIMA da linha em qualquer campo com `manuscrito: true`
- A linha dashed aparece na borda INFERIOR do espaço de escrita
- Nenhum outro modo de campo (normal) é afetado
