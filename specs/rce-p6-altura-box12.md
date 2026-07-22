# Spec P6 — Controle de altura individual: grupo Box 1+2

**Data:** 22/07/2026  
**Arquivos:** `receituario-config.ts`, `receituario.tsx` (designer)

## Alvo

Adicionar um slider exclusivo para a altura mínima do grupo de boxes 1 e 2 (faixa superior).

## Config

```ts
// Em ReceituarioConfig:
boxSuperiorMinHeight: number;   // altura mínima boxes 1+2 em px; default 120
```

```ts
// Em DEFAULT_CONFIG:
boxSuperiorMinHeight: 120,
```

## UI do designer

Na seção "Campos Internos dos Boxes das Faixas", adicionar antes do slider atual:

```
┌─────────────────────────────────────────────────────┐
│ ALTURA MÍNIMA — BOXES 1 E 2 (FAIXA SUPERIOR)        │
│ [slider 60–300px]  valor: 120 px                    │
├─────────────────────────────────────────────────────┤
│ ALTURA MÍNIMA — BOXES 3 E 4 (FAIXA INFERIOR)        │  ← renomear slider atual
│ [slider 60–300px]  valor: 180 px                    │
└─────────────────────────────────────────────────────┘
```

O slider atual `boxMinHeight` passa a controlar APENAS boxes 3+4.

## Critério de aceitação

- Mover o slider "Altura 1+2" afeta SOMENTE os boxes 1 e 2
- Mover o slider "Altura 3+4" afeta SOMENTE os boxes 3 e 4
- Valores persistidos em localStorage separadamente
