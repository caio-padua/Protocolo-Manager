# Spec P5 — Preview Sticky (acompanha o scroll do menu)

**Data:** 20/07/2026

## Situação atual
- Coluna direita tem `sticky top-20` (top=80px)
- Preview container tem `maxHeight: calc(100vh - 200px)` com overflow-auto
- O problema: `top-20` pode não coincidir com a altura real do header sticky

## Header altura real
- `<div className="bg-white border-b... px-6 py-4 sticky top-0 z-30">`
- py-4 = 16px top + 16px bottom, conteúdo ~36px = total ~68px

## Correção
1. Trocar `sticky top-20` por `sticky top-[72px]` (justo abaixo do header)
2. Preview container: `maxHeight: calc(100vh - 160px)` (72px header + 24px padding + 64px controles acima)
3. O container do preview escalado deve ter `overflow-y: auto` e a caixa cinza deve ter altura calculada
4. A coluna direita inteira: `height: calc(100vh - 80px)` com `overflow-y: auto` próprio

## Comportamento esperado
- Ao rolar para baixo nos accordions da esquerda, o preview da direita fica estacionado, sempre visível
- O preview em si (A4 escalado) tem scroll interno se for maior que o viewport
- Os botões Salvar / Imprimir abaixo do preview ficam acessíveis se rolar dentro da coluna direita
