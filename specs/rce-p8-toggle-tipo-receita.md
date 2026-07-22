# Spec P8 — Toggle: Receituário Especial vs Comum

**Data:** 22/07/2026  
**Arquivo:** `artifacts/padcom/src/pages/configuracoes/receituario.tsx`

## Alvo

Adicionar um controle visual (toggle ou botões A/B) no designer para alternar entre
`tipoReceitaPadrao: "especial"` e `tipoReceitaPadrao: "simples"`.

## Config existente

```ts
tipoReceitaPadrao: "especial" | "simples";  // já existe em ReceituarioConfig
```

O campo já existe — falta apenas expô-lo na UI do designer.

## UI

No início da seção "Campos Internos dos Boxes das Faixas" (ou em seção própria "Tipo de Receituário"):

```
┌─────────────────────────────────────────────────┐
│ TIPO DE RECEITUÁRIO                              │
│  [ ESPECIAL ]  [ COMUM ]   ← botões toggle      │
│  ▶ Especial: exibe boxes 3+4 (Comprador/Farmácia)│
│    Comum: sem boxes 3+4                          │
└─────────────────────────────────────────────────┘
```

Implementação: dois botões lado a lado, estilo `screen-3d` (inativo) / `bevel-3d` (ativo).

## Critério de aceitação

- Clicar "ESPECIAL" seta `tipoReceitaPadrao = "especial"` e salva
- Clicar "COMUM" seta `tipoReceitaPadrao = "simples"` e salva
- Preview atualiza imediatamente
- O botão ativo tem destaque visual claro (padrão Paxter 3D)
