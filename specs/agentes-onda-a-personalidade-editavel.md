# SPEC — Onda A: Personalidade Editável
**Data:** 19/07/2026 | **Status:** APROVADA PARA BUILD

## Objetivo
Tornar os quadradinhos (BaraDim) da aba Personalidade clicáveis. Clicar no N-ésimo quadradinho → valor da dimensão vira N → PATCH imediato na API → feedback visual instantâneo.

## Comportamento esperado
- Cada linha da tabela tem 14 grupos de 5 quadradinhos
- Hover: quadradinhos até a posição hovered ficam iluminados (preview do valor)
- Click no quadradinho N → PATCH `/api/agentes-personalidade/:agenteId` com `{ [dimensao]: N }`
- Optimistic UI: valor muda localmente antes da API confirmar
- Sucesso: badge "Salvo" verde pisca 1.5s
- Erro: reverte ao valor anterior

## Componente BaraDim novo
```tsx
// Props: valor (atual), cor (hex), onSave (async fn)
// Estado: hovered (0-5), saving (bool), saved (bool)
// Cursor: pointer em todos os quadradinhos
```

## Endpoint necessário (já existe)
```
PATCH /api/agentes-personalidade/:id
Body: { [dimensao]: number (1-5) }
```

## Aceite
- [ ] Quadradinhos respondem hover com preview
- [ ] Click salva na API e mostra "Salvo"
- [ ] Erro reverte o valor
- [ ] Nenhuma outra aba é afetada
