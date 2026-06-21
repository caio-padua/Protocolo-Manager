# Anamnese V2 — 00 · Visao e Principios

> Multi-spec da "melhor anamnese do mundo" (pedido do CEO Dr. Caio, 21/06/2026).
> Fonte de inspiracao: Dr. Replit Pactor (mockups premium + carta PARA_MANAGER) e
> padcom-saas (AnamneseIntegrativa: timeline, microtexto, score, demo, autosave).
> Esta pasta e o ALVO. Construir so o que esta aqui. Loop Paxter: especificar -> construir -> revisar.

## 1. Para quem (persona)
Paciente = empresario altamente demandado, sem tempo para "jogar conversa fora".
Quer rapido, eficiente, intuitivo, divertido, MUITO bem auto-explicado. Curioso sobre a
propria saude. Pode responder de casa, em etapas, ou junto com a enfermeira por chamada online.

## 2. Os 12 mandamentos da experiencia
| # | Principio | Como se manifesta |
|---|---|---|
| 1 | Nao e maratona | Cabecalho com linha do tempo: %, N de N perguntas, N de N grupos, tempo medio |
| 2 | Virar pagina, nao rolar | 1 grupo = 1 pagina curta; pouca rodinha e ja vira; nunca rolagem longa |
| 3 | Liberdade total | Pular categorias, responder em qualquer ordem, voltar, RECUSAR bloco (registrado) |
| 4 | Retoma de onde parou | Progresso salvo; volta e continua; nada se perde |
| 5 | Link que eu mando | Cada anamnese vira link seguro para enviar ao paciente |
| 6 | Pre/intra-consulta | Paciente sozinho, OU enfermeira junto online, OU medico preenche rapido (atalho) |
| 7 | Tudo explicado | Toda pergunta tem "Por que perguntamos?"; as dificeis tem video curto |
| 8 | Intensidade clara | Barra direcional com legenda ("mais a direita = mais dor / mais insonia") |
| 9 | Clique > digitar | Preferir clique a dropdown; toque-friendly, TDAH-friendly |
| 10 | Alinhado a guias | Tudo em linha vertical/horizontal; nada fora de posicao (Grade Imaginaria) |
| 11 | Ramifica sozinha | "Se isso, abre aquilo": resposta real liga/desliga as proximas perguntas |
| 12 | Data binding total | Toda resposta alimenta o motor -> gera RAS de relatorio + relatorio juridico |

## 3. Sensacao premium (da carta do Pactor)
- Abrir pela QUEIXA PRINCIPAL em texto livre: "Conte, com suas palavras, o que mais te incomoda."
- Espelhar as FASES classicas da anamnese (identificacao, queixa, historia, revisao de sistemas,
  antecedentes, habitos) — escola medica (Porto, Bates, Swartz).
- Acolhimento, nunca frio: a tela soa como medico atencioso, nao formulario de banco.
- Devolver um RESUMO que mostre que a pessoa foi COMPREENDIDA ("entendi que voce sente X").
- Cada pergunta delicada com "Por que perguntamos?" para nunca se sentir invadida.

## 4. Diagnosticado x Suspeito (o que o CEO ama do IHE/Pactor)
Toda condicao detectada entra com SELO: "DIAGNOSTICADO" (paciente confirmou diagnostico medico)
ou "SUSPEITO" (motor levantou pelos sintomas/escalas). O medico ve os dois separados, com a
origem (qual resposta gerou). Alimenta o RAS de relatorio e a lista de sugestoes.

## 5. Design (obrigatorio: skill-layout-paxter)
3D skeuomorfico: Saliente (conclusao/numero) + Concavo (campo/dado), verde-petroleo/ciano,
cantos quadrados, fluxo com setas. So a APRESENTACAO muda; o motor clinico nunca muda por estetica.
Cards e listas seguem a Grade Imaginaria (posicao fixa, campo vazio rotulado, status ao lado do ID).

## 6. Linhas vermelhas
- NAO mudar `motor-anamnese.ts` nem a semantica de ausencia (divida ja registrada).
- NAO mudar o contrato de envio do que ja existe sem versionar.
- NAO inventar limiar clinico de escala sem decisao do CEO.
- NAO perder o relevo 3D dos paineis.

RESUMO EM 1 LINHA: anamnese premium, leve e ramificada, que faz o empresario se sentir examinado
e curioso, com liberdade total e data binding que vira RAS de relatorio e relatorio juridico.
