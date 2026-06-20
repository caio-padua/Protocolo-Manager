---
name: Revisao final Paxter (como cliente + paridade mobile)
description: Checklist de fim de tela lido como se fosse o cliente, e a conferencia obrigatoria celular x desktop em layout E funcionalidade dos botoes.
---

# Revisao final Paxter

Regra-mae (CEO): ao terminar QUALQUER tela, parar e revisar olhando como se eu fosse o proprio
CLIENTE leigo — e so entao dar por pronto. Nada de "compilou, acabou".

## 1. Checklist "como cliente" (rodar no fim de cada tela)

| # | Pergunta (olhando como cliente) | Passa? |
|---|---|---|
| 1 | A conclusao/numero salta primeiro? (Saliente para conclusao, Concavo para o dado) | sim/nao |
| 2 | Tudo bate nas linhas-guia? (ver `references/alinhamento-espacamento.md`) | sim/nao |
| 3 | As pecas 3D respiram? (nada colado; gap minimo 12px) | sim/nao |
| 4 | Cada cor tem um unico significado? (petroleo=acao, verde=feito, ciano=foco, ambar=limite, vermelho=excede) | sim/nao |
| 5 | Toggle quadrado e dentro de sulco (ToggleWell)? | sim/nao |
| 6 | Cantos quadrados (radius 6-8px), sem pilula infantil? | sim/nao |
| 7 | Os contornos de conferencia (`outline ...`) foram removidos? | sim/nao |

## 2. Paridade CELULAR x DESKTOP (obrigatoria — layout E funcionalidade)

Conferir SEMPRE as duas larguras. Nao basta o layout: os BOTOES tem de funcionar nas duas.

| Eixo | Celular (~402px) | Desktop (~1280px) |
|---|---|---|
| Layout | nada cortado; grade larga vira EMPILHADO; tabela vira form empilhado com rotulo por campo | grade de colunas; tabela ao pixel |
| Botoes (funcionalidade) | alvo de toque >= 40px; clicavel sem zoom; nada escondido atras de outro | hover/neon funcionam; foco visivel |
| Toggle | responde ao toque; o sulco nao corta o thumb | responde ao clique |
| Scroll | rola sem travar; nada preso fora da tela | sem barra horizontal indevida |

Como conferir na pratica:
- Screenshot `app_preview` com viewport mobile (`402x874`) e desktop (`1280x720`).
- Testar os controles principais (botao primario, toggle, abrir/fechar) nas duas larguras.
- Se algo empilha errado, usar os breakpoints (`sm:`/`lg:`) — abaixo de `lg` empilhar, a partir de `lg`
  grade.

RESUMO EM 1 LINHA: terminar uma tela = revisar como cliente pelo checklist e provar que celular e
desktop batem no layout E nos botoes — so entao e "pronto".
</content>
