# Anamnese — Logicas de Subdivisao (curadas A + ramificacao por resposta B)

## Objetivo
Trocar a subdivisao automatica (hoje: "sistema com 2+ perguntas vira porteira") por uma
subdivisao CURADA a mao (A) e por RAMIFICACAO por resposta real (B): a resposta de uma
pergunta real liga/desliga as perguntas seguintes, encurtando a ficha do paciente ocupado.

## Modelo unico (A e B juntos)
Todo grupo de perguntas tem um SCREENER (pergunta de entrada) + uma regra de colapso.

| Tipo de screener | Como funciona | Quando uso |
|---|---|---|
| REAL (B) | Uma pergunta real ja existente e a entrada; ela aparece SEMPRE; uma resposta "negativa" definida esconde as perguntas-filhas | Quando ha uma pergunta natural de triagem (ex.: status de tabagismo, frequencia de alcool) |
| SINTETICO (A) | Uma porteira gerada "Voce tem alguma queixa de [sistema]?" (Sim/Nao), comeca FECHADA | Revisao por sistemas (ISDA), onde os sintomas sao irmaos e nao ha 1 triagem natural |

Regra de seguranca (inalterada): pergunta com `e_sinal_alarme` NUNCA entra em grupo
colapsavel — fica sempre visivel como pergunta direta.

## Mapa curado dos grupos (alvo exato)

### Bloco C — Revisao por Sistemas (ISDA) — screener SINTETICO por sistema
Sinais de alarme do bloco C ficam sempre visiveis: C-GER01, C-GER02, C-CAR01, C-HEM01.

| Grupo (sistema) | Porteira sintetica revela |
|---|---|
| Pele e faneros | C-PEL01, C-PEL02 |
| Cabeca/ORL | C-ORL01, C-ORL02 |
| Cardiovascular | C-CAR02, C-CAR03 (C-CAR01 alarme fica fora, sempre visivel) |
| Respiratorio | C-RES01, C-RES02 |
| Digestorio | C-DIG01, C-DIG02 |
| Geniturinario | C-URO01, C-URO02 |
| Musculoesqueletico | C-OSM01, C-OSM02 |
| Neurologico | C-NEU01, C-NEU02, C-NEU03 |
| Endocrino | C-END01, C-END02, C-END03 |

Diretas em C (sempre visiveis): C-GER01, C-GER02 (alarme), C-GER03, C-PEL/etc nao;
C-HEM01 (alarme), C-HEM02, C-REP01, Q012 (lista livre).

### Bloco I — Habitos — screener REAL (ramificacao por resposta)
| Grupo | Screener (real, sempre visivel) | Fecha (esconde filhas) quando | Filhas reveladas |
|---|---|---|---|
| Tabagismo | I-TAB01 (status) | resposta = "Nunca fumou" | I-TAB02 (macos-ano) |
| Etilismo | AUDITC1 (frequencia bebe) | resposta = 0 ("Nunca") | AUDITC2, AUDITC3, CAGE1, CAGE2, CAGE3, CAGE4 |
| Sono | screener SINTETICO "queixas de sono?" | porteira fechada | I-SON01, EPW1, EPW2, I-SON02 |

### Bloco K — Psicossocial — screener SINTETICO (escalas validadas)
Split curado: o `sistema`="Psiquiatrico" vira DOIS grupos.
| Grupo | Porteira sintetica revela | Observacao |
|---|---|---|
| Humor (PHQ-9) | PHQ1..PHQ8 | PHQ9 (ideacao suicida, alarme) fica SEMPRE visivel, fora do grupo |
| Ansiedade (GAD-7) | GAD1..GAD7 | — |

### Bloco L — Gineco/Andro — screener REAL por SEXO (A04, ramificacao cruzada)
| Grupo | Aparece quando | Perguntas |
|---|---|---|
| Ginecologico | A04 (sexo) = "F" | L-GIN01, L-GIN02 |
| Andrologico | A04 (sexo) = "M" | IPSS1, L-AND01 |
Se A04 nao respondida: mostra os dois grupos (cada um com porteira sintetica fechada).

## Casos extremos a tratar
1. Fechar porteira / responder "negativa" no screener real -> DESCARTAR respostas das filhas
   (a tela "sem queixa" tem que bater com o que e enviado). Ja vale para sintetico hoje.
2. Alarme nunca escondido (regra de seguranca) — mesmo dentro de um sistema com porteira.
3. Sexo nao respondido em L -> nao esconder nada (mostra os dois, fechados).
4. Contagem de progresso conta so perguntas VISIVEIS no momento.
5. Acessibilidade: screener real e a barra ja tem role/aria; manter.

## Definicao de PRONTO
- Config curada em arquivo proprio (`artifacts/padcom/src/lib/anamnese-subdivisao.ts`),
  legivel, sem depender mais da heuristica "2+".
- Screener REAL: a pergunta-gatilho aparece sempre; resposta negativa colapsa e limpa filhas.
- Screener SINTETICO: porteira fechada por padrao; abrir mostra filhas; fechar limpa filhas.
- Alarme sempre visivel. Sexo gate em L funciona. Progresso conta so visiveis.
- Validado por execucao real (screenshot do fluxo) + aprovacao do architect.

## Linhas vermelhas
- NAO mudar o motor (`motor-anamnese.ts`) nem a semantica de ausencia (divida ja registrada).
- NAO mudar o contrato do submit (envia so respostas preenchidas).
- NAO inventar limiar clinico de escala (PHQ/GAD nao auto-pulam por nota; usam porteira).

## Decisoes clinicas com default (confirmar com o CEO)
1. PHQ-9 / GAD-7: porteira sintetica (paciente abre), SEM auto-pular por nota. [default]
2. Sexo nao respondido em L: mostra os dois grupos fechados. [default]
3. Colapso por "negativa": tabagismo="Nunca fumou"; etilismo=0 ("Nunca"). [default]
