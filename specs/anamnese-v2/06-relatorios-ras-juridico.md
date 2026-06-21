# Anamnese V2 — 06 · Relatorios (RAS de relatorio + Relatorio Juridico) e Motor de Sugestoes

## 1. Para que serve o data binding
A anamnese e a FONTE. Tudo que o paciente respondeu (amarrado por perguntaId) alimenta:
```
[Respostas + Achados] -> [Motor de sugestoes] -> [RAS de relatorio (clinico)]
                                              \-> [Relatorio juridico (contrato/consentimento)]
```

## 2. RAS de relatorio (clinico, para o medico/prontuario)
Conteudo proposto (PDF + tela), reaproveitando o resultado do motor (padrao do padcom-saas):
| Secao | Vem de |
|---|---|
| Resumo "entendi que voce sente X" | queixa principal + sintomas marcados |
| Achados DIAGNOSTICADOS | findings tipo=diagnosticado |
| Achados SUSPEITOS | findings tipo=suspeito + origem |
| Score / faixa / eixos | motor (normalizedScore, band, axisScores) |
| Flags clinicas / alarmes | sinais de alarme respondidos |
| Acoes sugeridas pelo motor | motorActions |
| Matriz de medicacao | grupo de medicacao (07-kaizen) |
| Recusas registradas | anamnese_refusals |

Reutiliza o gerador de PDF existente do projeto (pdf-lib) e o padrao de upload ao Drive do cliente
(pasta AVALIACOES ou nova subpasta ANAMNESE). Nomeacao no padrao `YY.MM.DD ...`.

## 3. Relatorio juridico (protecao legal + contrato)
| Secao | Conteudo |
|---|---|
| Consentimento/LGPD | aceite, data/hora, IP/origem da sessao |
| Declaracoes do paciente | respostas que tem peso legal (alergias, doencas, medicacoes informadas) |
| Recusas | blocos que o paciente optou por nao responder (com data) |
| Vinculo com contrato | liga ao TCLE/contrato do protocolo (modulo de contratos ja existe) |

## 4. Motor de sugestoes (consumidor, nao dono da regra)
- Le findings + respostas e propoe: exames a pedir, substancias candidatas, alertas.
- NAO decide sozinho: e sugestao para o medico aprovar (mesma filosofia do orcamento).
- A regra clinica continua no motor existente; aqui so apresentamos/encaminhamos.

## 5. Onde aparece no sistema
- Na ficha do cliente: aba "Anamnese" com historico de sessoes + botao "Gerar RAS de relatorio".
- No cockpit: alertas de achados (vermelho/ambar) puxam atencao.

RESUMO EM 1 LINHA: a anamnese vira duas saidas — RAS de relatorio clinico (achados, score, sugestoes,
medicacao) e relatorio juridico (consentimento, declaracoes, recusas) — tudo a partir do data binding por perguntaId.
