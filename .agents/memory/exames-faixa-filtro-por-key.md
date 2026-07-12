---
name: Filtro de faixas de exame por posição (zone.key), nunca por nome
description: Qualquer filtro/agrupamento GLOBAL de faixas de exame deve chavear por zone.key (posição), porque o nome da faixa é editável por exame e polui.
---

# Filtro de faixas de exame: chavear por posição (zone.key), nunca por nome

Regra: numa tela que reúne MUITOS exames (ex.: planilha EXAMES—EVOLUÇÃO no Cockpit),
qualquer filtro/agrupamento de faixas deve chavear pela POSIÇÃO da faixa
(`cell.zone.key` = `below | t1 | t2 | t3 | above`, do menor valor ao maior),
nunca pelo nome (`cell.zone.name`).

**Why:** o nome da faixa virou editável por exame (campo `faixaName`). Um filtro
que casa/lista por nome acumula todo nome distinto → dezenas de botões (poluição)
e fica inconsistente (um exame chama "Cuidado" o que outro chama "Atenção", e o
botão não acende os dois). A posição é estável e existe em todo exame.

**How to apply:** monte 5 botões FIXOS por posição
(1/5 Extremo Baixo=below … 5/5 Extremo Alto=above); filtre por `cell.zone.key`.
Os nomes custom por exame ficam SÓ no gráfico individual daquele exame, jamais na
planilha global. A célula acesa continua brilhando na cor da PRÓPRIA faixa
(`cell.zone.color`) — cor por gravidade sobrevive, o filtro é por posição.

**Trade-off (decisão do CEO, Opção B):** "posição" mistura significado clínico
conforme a direção (o valor mais baixo é ruim em "quanto maior melhor" e bom em
"quanto menor melhor"). O CEO foi avisado e escolheu posição mesmo. A alternativa
consistente seria filtrar por GRAVIDADE/cor (5 severidades fixas) — guardar se o
CEO reabrir o assunto.

O endpoint de evolução já envia `cell.zone.key`; não precisa mexer no backend.
