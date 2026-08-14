# O ELO — Motor de Causalidade Clínica

Documento normativo da aba MEU TRATAMENTO na Área do Cliente.
Versão 2, escrita em 14 de agosto de 2026, substitui a versão 1 do mesmo dia.
Autor: Dr. Replit Manager. Aprovador: Dr. Caio (cacique).

---

## 1. CONCLUSÃO PRIMEIRO

1.1. O sistema hoje guarda **o que foi prescrito** e guarda **o que o corpo do paciente fez**.

1.2. Falta uma única peça no meio: **o que o paciente realmente cumpriu**.

1.3. Ao acrescentar essa peça, o sistema passa a produzir uma frase que nenhum concorrente brasileiro produz hoje: *"o senhor manteve noventa e dois por cento de constância e o seu ácido úrico caiu de quatro vírgula três para quatro vírgula zero"*.

1.4. Isso não é um painel. É uma **máquina de provar causalidade**, paciente por paciente, que se recalcula sozinha a cada laudo novo importado pelo robô do Google Drive.

1.5. O nome do motor é **O ELO** — porque ele liga duas pontas que hoje vivem separadas no banco de dados.

1.6. Custo de construção: **duas tabelas novas**. Todo o resto reaproveita motor que já roda em produção.

---

## 2. GLOSSÁRIO DESTE DOCUMENTO

2.1. **Aderência**: percentual das doses prescritas que o paciente reportou ter tomado.

2.2. **Marcador**: um exame de sangue com valor numérico, por exemplo o ácido úrico.

2.3. **Janela**: o intervalo de tempo entre duas coletas de exame consecutivas do mesmo marcador.

2.4. **Veredito**: o julgamento automático do motor sobre se o marcador caminhou a favor ou contra o tratamento naquela janela.

2.5. **Frente terapêutica**: cada uma das quatro linhas de tratamento que o paciente segue ao mesmo tempo.

2.6. **Multi-tenant**: arquitetura em que várias clínicas usam o mesmo sistema, cada uma vendo somente os próprios dados.

2.7. **JSONB**: formato de coluna do banco de dados PostgreSQL que guarda uma estrutura de dados livre, usada aqui para listar quais módulos a clínica contratou.

2.8. **Índice parcial**: regra de unicidade do banco que só vale para as linhas que atendem a uma condição, por exemplo somente as vigências ainda abertas.

---

## 3. A BASE REAL QUE JÁ EXISTE (verificada em 14/08/2026)

**Tabela 3.1 — Volume de dado clínico longitudinal já armazenado**

| Grandeza                                  |    Quantidade |
| :---------------------------------------- | ------------: |
| Resultados de exame com valor numérico    |        23.245 |
| Datas de coleta distintas                 |           593 |
| Pacientes com pelo menos um resultado     |           176 |

3.2. A tabela `exam_analyte_catalog` tem a coluna `direction`, que já sabe, para cada marcador, se subir é bom (`higher_better`), se subir é ruim (`lower_better`) ou se o certo é ficar no meio da faixa (`target`).

3.3. Essa coluna é a peça mais valiosa e a menos usada do sistema: sem ela seria impossível emitir um veredito automático.

**Tabela 3.4 — Exemplo real: série do cliente 44 (Caio Henrique Fernandes Padua)**

| Marcador                            | Direção        | 26/03/2026 | 11/06/2026 | Variação | Veredito     |
| :---------------------------------- | :------------- | ---------: | ---------: | -------: | :----------- |
| Ácido Úrico (mg/dL)                 | lower_better   |        4,3 |        4,0 |    −7,0% | FAVORÁVEL    |
| Proteína C Reativa Ultra (mg/dL)    | lower_better   |       0,84 |       0,29 |   −65,5% | FAVORÁVEL    |
| Hemoglobina Glicada (%)             | lower_better   |        5,3 |        5,5 |    +3,8% | DESFAVORÁVEL |
| TSH (µUI/mL)                        | target         |       2,95 |       2,01 |   −31,9% | FAVORÁVEL    |

3.5. Esses quatro vereditos foram calculados a partir do banco de produção, sem nenhum valor inventado.

3.6. O sistema tinha esse dado guardado desde 2020 e nunca o mostrou a ninguém.

---

## 4. AS QUATRO FRENTES (V1 aprovado pelo CEO)

**Tabela 4.1 — Frentes terapêuticas e a fonte de verdade de cada uma**

| Frente                  | Fonte de verdade no banco        | O que o paciente reporta                      | Natureza do ritmo          |
| :---------------------- | :------------------------------- | :-------------------------------------------- | :------------------------- |
| Fórmulas Magistrais     | `lembretes_prescricao.periodos`  | Tomei / Não tomei, fórmula a fórmula           | Diário, 9 janelas fixas    |
| Protocolo Injetável     | `protocols` + `sessions`         | Compareci / Não compareci à sessão             | Por sessão, intervalo próprio |
| Plano Nutricional       | motor de dieta (manual e IA)     | Segui / Não segui o plano do dia               | Diário, por refeição       |
| Próxima Consulta        | agenda                           | Somente visualiza e confirma presença          | Pontual                    |

4.2. **Regra de ouro do ritmo**: fórmula magistral é diária e tem janela de horário; protocolo injetável é por sessão e tem intervalo próprio em dias.

4.3. Nunca tratar sessão injetável como se fosse dose diária — via intramuscular, endovenosa, subcutânea e implante têm frequências individuais definidas em `protocol_items.interval_days`.

4.4. A frente de Próxima Consulta é a única sem reporte de aderência, porque comparecer à consulta já é registrado pela agenda.

---

## 5. O QUE JÁ EXISTE CONTRA O QUE FALTA

**Tabela 5.1 — Inventário de peças: nada será recriado**

| Peça                                    | Situação      | Onde vive                                    |
| :-------------------------------------- | :------------ | :------------------------------------------- |
| Motor de lembrete por período           | JÁ EXISTE     | `lib/cron.ts` + `lib/lembrete-periodo.ts`     |
| Nove janelas canônicas do dia           | JÁ EXISTE     | `MAPA_PERIODO` e tabela `periodos_dia`        |
| Mensagem rica editável                  | JÁ EXISTE     | `lib/mensageria-opus.ts`                      |
| Entrega por WhatsApp com espelho Telegram | JÁ EXISTE   | `lib/whatsapp.ts`                             |
| Exames longitudinais com unidade canônica | JÁ EXISTE   | `exam_results`                                |
| Direção do marcador                     | JÁ EXISTE     | `exam_analyte_catalog.direction`              |
| Importação automática de laudos         | JÁ EXISTE     | robô do Google Drive, a cada quatro horas     |
| Avatar de voz e de vídeo do médico       | JÁ EXISTE     | `clinic_avatars` + `avatar_uso_log`           |
| Emissão de documento em PDF assinado    | JÁ EXISTE     | Fábrica de Documentos + `embedPadesSignature` |
| Controle de módulo por clínica          | JÁ EXISTE     | `empresas.modulos_ativos` + `moduleGuard`     |
| **Aderência dose a dose**               | **A CONSTRUIR** | **duas tabelas novas**                      |
| **Histórico do que estava prescrito**   | **A CONSTRUIR** | **`lembretes_prescricao.periodos` é sobrescrito hoje** |

5.2. O ponto 5.1 é a tese inteira: onze peças prontas, duas a construir.

---

## 6. AS DUAS TABELAS NOVAS

### 6.1. `formula_vigencia` — o passado que hoje se perde

6.1.1. Problema atual: a coluna `lembretes_prescricao.periodos` é sobrescrita a cada alteração da prescrição.

6.1.2. Consequência: hoje é impossível saber o que estava prescrito em uma data passada, e sem isso não existe denominador para calcular aderência.

6.1.3. Solução: uma linha por fórmula por período, com data de início e data de fim.

6.1.4. Vigência aberta é a linha com `fim_em` nulo.

6.1.5. **Armadilha do PostgreSQL**: valor nulo não colide em índice único, portanto a unicidade de "só uma vigência aberta por fórmula" exige **índice parcial** com a condição `WHERE fim_em IS NULL`.

### 6.2. `aderencia_reporte` — o que o paciente respondeu

6.2.1. Uma linha por reporte: cliente, frente, referência do item, data, janela, resposta.

6.2.2. Resposta admite três estados: tomou, não tomou, esqueceu.

6.2.3. Idempotência por trio: cliente, item, janela do dia. O mesmo reporte enviado duas vezes não gera duas linhas.

6.2.4. Toda data e hora vem de `lib/brt.ts`, nunca de `new Date()` cru.

### 6.3. Regra de Ouro obedecida

6.3.1. Somente `CREATE TABLE` e `ADD COLUMN`.

6.3.2. Nenhum `DROP`, nenhum `TRUNCATE`, nenhuma exclusão de dado existente.

6.3.3. Nenhuma tabela existente muda de forma.

---

## 7. O MOTOR DE VEREDITO

7.1. Para cada par de coletas consecutivas do mesmo marcador, o motor calcula a janela, a aderência dentro dela e a variação do valor.

7.2. **A ordem de julgamento importa e não pode ser invertida.**

**Tabela 7.3 — Ordem obrigatória das regras do veredito**

| Ordem | Regra                                                                 | Por que vem nesta posição                                                     |
| ----: | :--------------------------------------------------------------------- | :---------------------------------------------------------------------------- |
|     1 | Marcador `target` sem faixa completa devolve **SEM VEREDITO**           | Devolver "estável" seria mentir por omissão; o motor prefere calar             |
|     2 | **Cruzar a faixa de referência** decide sozinho, a favor ou contra      | Atravessar o limite é sinal clínico mesmo com variação percentual mínima       |
|     3 | Só então aplica o corte de ruído de laboratório                          | O corte existe para descartar oscilação de aparelho, não mudança de estado     |
|     4 | Por fim, aplica a direção do marcador                                    | `lower_better`, `higher_better` ou aproximação ao centro para `target`         |

7.4. Exemplo que prova por que a ordem importa: uma hemoglobina glicada que vai de cinco vírgula seis para cinco vírgula sete sobe apenas um vírgula oito por cento, mas atravessa o teto de referência e entra em faixa de pré-diabetes.

7.5. Se o corte de ruído viesse antes, esse caso seria rotulado como estável e o médico não seria avisado. Por isso o cruzamento de faixa vem primeiro.

7.6. **PENDÊNCIA ANTES DE IR PARA O BACKEND**: o corte de ruído hoje é um percentual global de três por cento. Isso é provisório. Precisa virar **tolerância por analito**, porque o ruído de laboratório do TSH não é o mesmo da hemoglobina glicada. Definir essa tabela de tolerâncias é decisão clínica do Dr. Caio, não decisão de programador.

7.7. **O veredito nunca afirma causa. Ele afirma coincidência medida no tempo.**

7.8. Duas coletas consecutivas não estabelecem relação causal, e nenhuma tela pode dizer que o tratamento funcionou.

7.9. A tela do paciente diz que os dois caminharam juntos. A tela do médico diz que houve associação temporal. A interpretação é sempre clínica e sempre humana.

7.10. Quando a aderência é alta e o marcador caminha contra, o motor levanta a bandeira mais valiosa de todas: *o tratamento pode não estar funcionando para este paciente*.

7.11. Essa bandeira ordena a fila de triagem do médico.

---

## 8. A EXPERIÊNCIA DO PACIENTE

8.1. Exigência do CEO: *"o paciente deve se sentir francamente amparado, como um príncipe, nunca como cliente de balcão de drogaria"*.

8.2. O paciente nunca vê a palavra aderência, nem percentual de falha, nem cobrança.

8.3. Ele vê **O SEU PULSO** — a constância dele, apresentada como conquista, não como dívida.

8.4. Ele reporta fórmula por fórmula dentro do período, com dois toques, sem digitar nada.

8.5. Quando o corpo responde, ele recebe a frase causal e pode **ouvir o resultado na voz do próprio médico**.

8.6. Quando o corpo não responde, o paciente não é culpado na tela — a bandeira vai para o médico, em silêncio.

---

## 9. A ABA DÚVIDAS PERMANECE SEPARADA

9.1. Ordem do CEO: *"cada um com seu cada qual"*.

9.2. MEU TRATAMENTO é onde o paciente **reporta**. DÚVIDAS é onde o paciente **pergunta**.

9.3. As duas abas não se misturam e não se absorvem.

9.4. Única ponte permitida: ao abrir uma dúvida, o paciente **pode opcionalmente** marcar a qual das quatro frentes ela se refere.

9.5. Com isso a dúvida chega ao médico já com contexto, sem que a aba perca a independência.

---

## 10. FORA DO ESCOPO

10.1. A Carta de Apresentação de Tratamento **não faz parte deste escopo** — ela é emitida somente no fechamento de protocolo e não tem relação com aderência de fórmulas.

10.2. Nenhum robô autônomo perguntará ao paciente pelo WhatsApp ou pelo Telegram. O reporte vive na Área do Cliente.

10.3. O motor de mensageria **não será recriado**, em nenhuma hipótese.

---

## 11. MONETIZAÇÃO MULTI-TENANT

11.1. Cada módulo abaixo é uma chave dentro de `empresas.modulos_ativos` e passa pelo `moduleGuard` que já está no ar.

11.2. A clínica que não contratar simplesmente não vê a tela. Nenhuma linha nova de cobrança precisa ser inventada.

**Tabela 11.3 — Os quatro módulos licenciáveis do ELO**

| Módulo         | O que entrega                                              | Modelo de cobrança              | Peça reaproveitada                 |
| :------------- | :--------------------------------------------------------- | :------------------------------ | :--------------------------------- |
| ELO ESSENCIAL  | Aba MEU TRATAMENTO e painel de constância                   | Mensalidade fixa por clínica    | Motor de lembrete por período      |
| ELO CAUSAL     | Esforço do paciente e resposta do corpo lado a lado          | Por paciente ativo, por mês     | `exam_results` + `direction`       |
| ELO VOZ        | Narrativa causal falada pelo avatar do médico                | Consumo, por caractere e segundo | `avatar_uso_log` (medição pronta)  |
| ELO DOSSIÊ     | PDF trimestral de causalidade, assinado digitalmente         | Por documento emitido           | Fábrica de Documentos + PAdES      |

11.4. O ELO CAUSAL é o coração comercial: é o único que cobra por paciente e o único que fica mais valioso a cada mês.

**Tabela 11.5 — Por que este produto se sustenta comercialmente**

| Nº | Tese                                            | Mecanismo                                                                            |
| -: | :---------------------------------------------- | :----------------------------------------------------------------------------------- |
| 01 | O paciente vê a própria biologia responder      | Quem enxerga o marcador melhorar por causa da própria constância não abandona o tratamento |
| 02 | O médico tem prova, não promessa                | Na consulta de retorno o médico abre um número; a conversa sai de preço e vai para resultado |
| 03 | O dado fica mais valioso a cada mês             | Cada janela nova refina o motor; sair do sistema significa perder o histórico causal   |

11.6. A tese 03 é a barreira de saída mais honesta que existe: não prende por contrato, prende por valor acumulado.

---

## 12. ORDEM DE CONSTRUÇÃO SUGERIDA

**Tabela 12.1 — Sequência de obra, da fundação ao acabamento**

| Etapa | O que fazer                                              | Depende de |
| ----: | :-------------------------------------------------------- | :--------- |
|     1 | Criar `formula_vigencia` e passar a versionar a prescrição | —          |
|     2 | Criar `aderencia_reporte` e a rota de reporte              | Etapa 1    |
|     3 | Construir a aba MEU TRATAMENTO com as quatro frentes       | Etapa 2    |
|     4 | Implementar o motor de veredito e o painel do médico       | Etapa 2    |
|     5 | Ligar a narrativa causal ao avatar de voz                  | Etapa 4    |
|     6 | Emitir o dossiê trimestral em PDF assinado                 | Etapa 4    |
|     7 | Registrar os quatro módulos em `empresas.modulos_ativos`   | Etapas 3 a 6 |

12.2. As etapas 1 e 2 são fundação: sem elas nada mais se sustenta.

12.3. As etapas 3 e 4 podem ser construídas em paralelo por agentes diferentes, porque não tocam nos mesmos arquivos.

---

## 13. PROVA VISUAL

13.1. Três telas foram construídas e colocadas no quadro do workspace como ENTREGA 53.

13.2. MEU TRATAMENTO, visão do paciente no celular, com O SEU PULSO e as quatro frentes.

13.3. O ELO, visão do médico, com os quatro elos calculados a partir dos exames reais do cliente 44.

13.4. O ELO como produto, com os quatro módulos licenciáveis e a tese comercial.

13.5. O código-fonte das três telas vive em `artifacts/mockup-sandbox/src/components/mockups/elo-causal/`.

---

## RESUMO EM 1 LINHA

O sistema já sabe o que foi prescrito e o que o corpo respondeu, e ao acrescentar duas tabelas que registram o que o paciente cumpriu, ele passa a provar causalidade clínica automaticamente, virando quatro módulos vendáveis às clínicas futuras sem recriar um único motor.
