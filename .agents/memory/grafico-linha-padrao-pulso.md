---
name: Gráfico de linha — padrão do Pulso
description: espessura, faixas e ponto ativo vêm de graficoPadrao.ts
---
Todo gráfico de linha usa as constantes de cockpit-cliente/graficoPadrao.ts (linha 1,25; ponto ativo quadradinho preto vazado; setas esquerda/direita movem o ponto).

**Why:** o CEO notou antropometria e exames mais grossos que o Pulso (22/11/2026); "gráfico sem faixa não é gráfico".
**How to apply:** nunca escrever strokeWidth solto em gráfico; regra em skill-layout-paxter/references/grafico-linha-faixas.md. Medidas sem faixa oficial (circunferências, alguns exames) seguem sem faixa, com aviso.
