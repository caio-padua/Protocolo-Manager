# Spec — Anamnese v2: glint no nome/frase + tecido do cabeçalho liso

Data: 24/06/2026. Loop Paxter acionado por voz pelo CEO ("Loop Paxter").

## Objetivo (uma frase)
Estender o efeito de luz (glint) do símbolo Paxter para a palavra "PAXTER" e para a
frase "CLINICAL INTELLIGENCE SYSTEM", e deixar o tecido do cabeçalho LISO para não
competir com o tecido que envolve as questões — tudo puramente visual, nos dois temas.

## Requisitos exatos
1. ITEM 2a — A palavra "PAXTER" recebe o MESMO efeito de luz do símbolo (faixa-sol
   especular + faísca de contorno), usando o motor único `PaxterGlintPremium`
   (nunca forkar), com os contornos `WORD_LETTERS`. Calibrar largura do glint para
   letras finas e o alcance do sweep para a largura da palavra (viewBox 1026×150).
2. ITEM 2b — A frase "CLINICAL INTELLIGENCE SYSTEM" recebe um brilho que a varre na
   MESMA cadência (ciclo ~12s, janela curta de luz). Como é TEXTO (não vetor), usar
   um shimmer de texto: cor sólida de base SEMPRE visível + camada de luz por cima em
   `mix-blend-mode: screen` (só clareia). Se a camada de luz sumir, a base permanece.
3. ITEM 3 / 3b — O tecido "terno" do CABEÇALHO (topo, sob o símbolo) é removido: o
   cabeçalho fica LISO (`bg-card`). O tecido permanece SÓ no corpo, envolvendo as
   questões (a camada `.leva-fabric` da raiz). Decisão do CEO: o tecido escolhido é o
   de baixo; o de cima fica liso para não refletir/competir ("gavetas").

## Casos extremos
- Contraste do shimmer da frase sobre fundo claro e escuro (não pode sumir; base sólida resolve).
- `prefers-reduced-motion`: motor já trata (sem animação). O shimmer da frase deve
  também respeitar (sem animação, só a base sólida).
- Glint de borda nas letras pode poluir: manter discreto; se ficar ruim, reduzir
  opacidade/largura — sem remover a faixa-sol.
- Header liso não pode destoar do corpo a ponto de virar "degrau" feio (conferir por screenshot).

## Definição de PRONTO
- Captura de tela CLARO e ESCURO mostrando: nome PAXTER com luz, frase com brilho que
  varre, cabeçalho liso (sem trama) e corpo com trama.
- Motor de luz é UM só (`PaxterGlintPremium`); palavra usa props opcionais, não fork.
- Lógica/motor/payload da anamnese 100% intactos.
- Revisão do architect sem pendência.

## Linhas vermelhas
- NÃO tocar fluxo de sessão, skip-logic, payload, persistência, chamadas de API.
- NÃO duplicar o engine de glint (memória paxter-glint-motor-unico).
- NÃO usar clip de texto SEM base sólida por baixo (memória paxter-botoes-validados).
- ITEM 1 (renderizar PADCON "no mesmo processo do PAXTER") NÃO entra nesta spec:
  depende das instruções do Dr. Claude (não recebidas) e conflita com a decisão
  registrada de que PADCON = recorte da arte oficial. Fica como pergunta ao CEO.
