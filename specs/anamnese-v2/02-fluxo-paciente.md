# Anamnese V2 — 02 · Fluxo do Paciente (cabecalho, virar pagina, intensidade, explicacao)

## 1. Cabecalho com linha do tempo (sempre visivel no topo)
Quatro medidores, lado a lado, em inserts Concavos alinhados (Grade Imaginaria):
| Medidor | Mostra | Forma |
|---|---|---|
| Progresso | % concluido | barra segmentada Paxter, faixa atual pulsando a luz |
| Perguntas | N de N respondidas | insert Concavo "N / total" |
| Grupos | N de N grupos completos | insert Concavo "N / total" |
| Tempo medio | media por pergunta / estimativa restante | insert Concavo, em min |

Abaixo: TITULO do grupo + SUBTITULO acolhedor + microtexto (padrao STEP_LABELS do padcom-saas).
No titulo do grupo aparece tambem: "X perguntas · Y sub-paginas" para nao criar expectativa.

## 2. Virar pagina, nao rolar
- 1 GRUPO = 1 pagina. Se o grupo for grande, ele vira N sub-paginas curtas (paginacao interna).
- Rodape fixo (sticky) com: Voltar · Salvar/Pular · Continuar (CTA verde-petroleo `btn-3d`).
- Mobile: CTA grande fixo embaixo (padrao MobileStep do Pactor). Nunca rolagem longa.

## 3. Mapa de navegacao (liberdade de ordem)
- Botao "Mapa da anamnese": lista os grupos como cartoes clicaveis (pode pular para qualquer um).
- Cada cartao do mapa mostra: nome, X perguntas, status (vazio / em andamento / completo / RECUSADO).
- Botoes de atalho: "Ir para o final", "Responder so este grupo", "Voltar ao mapa".

## 4. Controles por intencao (clique > dropdown)
| Tipo de resposta | Controle (Paxter) | Regra |
|---|---|---|
| Sim/Nao | par de cartoes-botao `btn-3d-soft` iguais | nunca colorir so um |
| Escolha 1 entre N | cartoes clicaveis (chips grandes), nao `<select>` | toque-friendly |
| Multipla | caixas grandes tappable (label inteiro clica) | padrao do mockup Pactor |
| Intensidade/escala | DIAL/barra direcional com legenda | ver secao 5 |
| Numero (dose, horas) | stepper +/- + campo gravado | stepper concorda com a barra |
| Texto livre (queixa) | campo gravado grande, acolhedor | abre a anamnese |

Dropdown so quando a lista for muito longa (ex.: cidade); o padrao e clique.

## 5. Barra de intensidade com legenda direcional (exigencia explicita)
- A direcao tem que ser OBVIA. Ex. dor: extremo esquerdo "Sem dor" -> extremo direito "Dor maxima".
- Ex. insonia: esquerda "Durmo bem" -> direita "Insonia intensa". Quanto mais a direita, pior.
- Mostrar legenda fixa nas duas pontas + rotulo do nivel atual em destaque (Saliente).
- Concordancia de direcao (regra Paxter FrequencyDial): seta, barra e teclado apontam no mesmo
  sentido; nunca a seta brigar com o crescimento da barra.
- Para sinais "ruim para os dois lados" (ex.: peso), usar escala neutra com ponto central rotulado.

## 6. Explicacao por pergunta + video nas dificeis
- Toda pergunta tem botao "Ver explicacao" (ciano) -> abre HelpModal (padrao Pactor):
  eyebrow + titulo + orientacao + bullets + "Entendi, continuar".
- Perguntas dificeis tem `videoSrc`: coluna de video no modal (sem autoplay, com legenda,
  30-60s, 1 conceito). Estrutura do video: o que e / comparacao do dia a dia / por que importa
  para voce / frase de tranquilidade (da carta do Pactor).
- Texto da explicacao e do video vem de config por perguntaId (campo `observacao`/novo campo).

## 7. Acessibilidade e alinhamento
- Tudo alinhado por guias verticais/horizontais (caixa de largura fixa + justify-between).
- role/aria nos controles (slider, grupo de radio, checkbox com aria-label).
- Alvo de toque grande; contraste alto (TDAH).

RESUMO EM 1 LINHA: cabecalho com 4 medidores, uma pagina por grupo que vira (nao rola), clique no
lugar de dropdown, barra de intensidade com legenda direcional clara, e explicacao/video em toda pergunta.
