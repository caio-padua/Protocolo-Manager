# Anamnese V2 — 03 · Motor Progressivo e Ramificacao ("se isso, abre aquilo")

> Reaproveita o desenho ja aprovado em `specs/anamnese-subdivisao.md` (modelo A+B) e o eleva
> a "analise progressiva evolutiva com sub-ramificacoes conforme a necessidade se faca necessaria".

## 1. Modelo unico de porteira (A curado + B por resposta)
| Tipo | Como abre | Onde uso |
|---|---|---|
| REAL (B) | pergunta real aparece sempre; resposta "negativa" esconde as filhas | quando ha triagem natural |
| SINTETICO (A) | porteira "Tem queixa nisto? Sim/Nao", comeca fechada | revisao por sistemas (ISDA) |

Seguranca: pergunta `e_sinal_alarme` NUNCA entra em grupo colapsavel — sempre visivel.

## 2. Ramificacao progressiva (organograma)
A profundidade cresce so quando precisa. Exemplo etilismo:
```
AUDITC1 (frequencia bebe?) --"Nunca"--> grupo fecha (0 perguntas extras)
                            --bebe----> AUDITC2, AUDITC3 (quanto/binge)
                                          --pontuacao sobe--> CAGE1..CAGE4 (dependencia)
```
Exemplo medicacao (carta do Pactor): ao informar um remedio, abre a correlacao com a doenca:
```
[Remedio + mg] -> "Para qual doenca?" -> [escolhe doenca ja citada] OU [marca doenca nova]
                                        -> abre matriz manha/tarde/noite (ver 07-kaizen)
```

## 3. Mapa de gatilhos (curado, do banco real)
| Grupo | Gatilho | Fecha quando | Filhas |
|---|---|---|---|
| Tabagismo | I-TAB01 status | "Nunca fumou" | I-TAB02 |
| Etilismo | AUDITC1 freq | "Nunca" | AUDITC2, AUDITC3, CAGE1-4 |
| Ginecologico | A04 sexo = F | sexo M | L-GIN01, L-GIN02 |
| Andrologico | A04 sexo = M | sexo F | IPSS1, L-AND01 |
| Sono | porteira sintetica | fechada | I-SON01, EPW1, EPW2, I-SON02 |
| Humor (PHQ-9) | porteira sintetica | fechada | PHQ1..PHQ8 (PHQ9 alarme sempre visivel) |
| Ansiedade (GAD-7) | porteira sintetica | fechada | GAD1..GAD7 |
| ISDA (9 sistemas) | porteira sintetica por sistema | fechada | sintomas do sistema (alarmes ficam fora) |

Sinais de alarme sempre visiveis: C-GER01, C-GER02, C-CAR01, C-HEM01, F02, PHQ9.

## 4. Diagnosticado x Suspeito
- DIAGNOSTICADO: o paciente confirma ("tenho diabetes", D02=sim) -> finding tipo=diagnosticado.
- SUSPEITO: o motor levanta por escala/sintoma (ex.: PHQ-9 alto -> suspeita de depressao) ->
  finding tipo=suspeito, com origemPerguntaId.
- Os dois entram em `anamnese_findings` e aparecem separados para o medico e no relatorio.
- ADAPTER fora do motor (decisao apos parecer do architect, 21/06/2026): o `computeMotor` atual
  NAO devolve a tipagem diagnosticado/suspeito. Em vez de mexer no motor (linha vermelha), criar
  `anamnese-findings-adapter.ts` que recebe a saida do motor + as respostas e PRODUZ os findings.
  O motor continua intocado; o adapter so traduz/classifica.

## 5. Regras de colapso e limpeza
- Fechar porteira / responder "negativa" -> DESCARTAR respostas das filhas (tela "sem queixa"
  bate com o enviado). Vale para real e sintetico.
- Progresso conta SO perguntas visiveis no momento (porteira fechada nao infla o "N de N").
- Config vive em arquivo proprio do front (`anamnese-subdivisao.ts`) + espelhada no questionario
  do back para o motor saber o que era visivel.

## 6. Linha vermelha
NAO mudar `motor-anamnese.ts`. A ramificacao e de APRESENTACAO + captura; o julgamento clinico
(achados/score) continua no motor. Limiar clinico novo so com decisao do CEO.

RESUMO EM 1 LINHA: porteira unica (real por resposta + sintetica curada) que ramifica em
profundidade so quando precisa, com alarmes sempre a mostra e achados separados em diagnosticado x suspeito.
