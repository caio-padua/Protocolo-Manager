---
name: Numerais Cormorant no sistema inteiro (web + PDF)
description: Como os algarismos do sistema viraram Cormorant Garamond sem tocar em componente, e por que o arquivo da fonte foi remapeado em vez de usar a feature CSS lnum.
---

# Numerais em Cormorant — arquitetura da troca

A referência aprovada pelo CEO é a **Área do Cliente, parte de contratos e
pagamentos**: números em Cormorant Garamond com **algarismo alto (lining)**.

## Regra

Os algarismos do sistema saem em Cormorant Garamond; o resto do texto não muda.

**Why:** pedido explícito do CEO em 13/08/2026, restrito a "somente números e
numerais". Trocar a fonte de componente em componente seria dezenas de pontos de
falha e qualquer tela nova nasceria fora do padrão.

**How to apply:** a troca vive em UM lugar — os `@font-face` da família
`PaxmedNum` em `artifacts/padcom/src/index.css`, com `unicode-range` restrito a
`U+0030-0039`. Essa família é **prefixada** nas pilhas de fonte; como ela só sabe
desenhar dígitos, toda letra cai para a próxima família da pilha. Tela nova herda
o comportamento sem fazer nada.

## Duas armadilhas que custaram tempo

### 1. O algarismo padrão do Cormorant é old-style, não lining

Sem intervenção, o Cormorant desenha algarismo baixo, com descida abaixo da linha
— visualmente errado para a referência, e no PDF o "1" parecia a letra **I** e o
"0" parecia **O** nos cartões de valor da capa.

Depender da feature CSS `lnum` é frágil: qualquer componente que mexa em
`font-variant-numeric` pode derrubá-la, e **`pdf-lib` não aplica feature OpenType
nenhuma**, então no PDF a feature CSS não existe como opção.

Solução: o algarismo alto foi **congelado dentro do arquivo `.woff`** com
`fontTools` — o `cmap` dos pontos U+0030..U+0039 foi remapeado para os glifos
`.lf` (`zero` → `zero.lf`) obtidos da feature `lnum` no GSUB. Os arquivos
resultantes têm sufixo `-Lining` e servem **web e PDF ao mesmo tempo**.
Conferência objetiva: altura do "0" sobe de `0,4120 em` para `0,6500 em`.

### 2. Sem size-adjust o número sai menor que a palavra ao lado

Algarismo alto do Cormorant mede `0,650 em`; o do Inter mede `0,7275 em`. Por isso
o `size-adjust: 111.9%` — valor **medido**, não estimado.

## Exceção deliberada

`monospace` / `--app-font-mono` **não** recebem `PaxmedNum`. Cormorant é
proporcional e quebraria o alinhamento de código e identificadores.

## Efeito colateral conhecido

Como o `unicode-range` cobre só os dígitos, em códigos técnicos mistos
(`LOT-VTC-2025-03`) a metade numérica fica serifada e as letras não. Vírgula e
ponto também continuam na fonte de texto — incluí-los na face de números afetaria
toda pontuação de frase do sistema. O CEO foi avisado; decisão pendente.
