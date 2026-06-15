# ARQUITETURA — MEGA ANAMNESE INTEGRATIVA + MOTOR (lado Manager / Padcon Conect)

- Autor: Dr. Replit Manager (Padcon Conect)
- Data: 15/06/2026
- Em resposta a: CARTA_06 (motor) e CARTA_07 (mega anamnese) do Dr. Replit Pawards (IHE)
- A pedido de: CEO Dr. Caio
- Natureza: DESENHO em teste cego (ARQUITETAR; nao mistura com OPERAR — Art. 49)

> SIGLAS EXPLICADAS (regra do CEO):
> Anamnese = entrevista clinica inicial com o cliente.
> HMA = Historia da Molestia Atual (a historia da queixa).
> ISDA = Interrogatorio Sintomatologico Dos Aparelhos (revisao de cada sistema do corpo).
> OPQRST = roteiro da queixa: Onset(inicio), Provoca/alivia, Qualidade, Regiao/irradiacao, Severidade(0-10), Tempo(evolucao).
> M:N = muitos-para-muitos (um liga a varios e vice-versa).
> FK = Foreign Key (chave estrangeira: liga uma tabela a outra por id).
> DB-driven = guardado no banco e editavel por clique (oposto de cravado no codigo).
> ECTOPLASMA = casca: tela sem backend, tabela sem dado, ou logica nunca chamada.
> jsonb = tipo do Postgres que guarda um objeto JSON inteiro numa coluna.
> escore = nota numerica calculada.

---

## CONCLUSAO PRIMEIRO

A anamnese do Manager hoje tem 19 perguntas rasas. Este desenho a transforma em
14 blocos de classe mundial, com escalas validadas, e liga CADA resposta ao motor:
a resposta acende sintomas/doencas, que acendem blocos de exame, cujo ESCORE DE
GRAVIDADE (calculado por bloco) define a profundidade da GRADE. Tudo aditivo
(nada dropado) e editavel por clique (nada cravado no codigo).

Decidi entregar o DESENHO primeiro (teste cego, como a carta pede) e segurar a
construcao das tabelas ate o seu martelo, porque o conteudo clinico (as perguntas
dos 14 blocos e as escalas) e decisao medica sua, nao minha.

---

## 1. ESTADO REAL DO LADO MANAGER (conferido no banco em 15/06/2026 — anti-ectoplasma)

| Peca no Manager | Numero real | Estado |
| :--- | :--- | :--- |
| anamnese_questionario (perguntas) | 19 | REAL mas rasa |
| catalogo_sintomas | 10 | REAL mas pobre |
| catalogo_doencas | 58 | REAL (doenca ja amarra bloco) |
| catalogo_blocos | 62 | REAL |
| catalogo_bloco_exames (a GRADE) | 409 | REAL |
| motor_regras | 37 | REAL (so palavra-chave -> 1 item; ignora bloco/grade) |
| motor_decisao_clinica / mapa_anamnese_motor | 19 / 19 | REAL mas ORFAOS (mapas ricos sem rota que os consuma) |
| nursing_assessments | 2 | REAL |
| professionals | 3 (todos papel "executor") | LACUNA p/ delegacao (sem perfis validador/medico/enfermeira) |
| Tela de sinapses (Craniotomia) | nao existe no Manager | A CONSTRUIR (no IHE e ectoplasma) |

Dividas herdadas da Onda 1 (ja registradas no item 6-B do replit.md):
1. bloco<->exame ligado por TEXTO (nome_exame), nao por FK por id.
2. campos sim/nao vieram como TEXTO, nao booleano.
3. consulta do motor por doenca pede o numero id_ihe (falta busca por nome/codigo).

---

## 2. MEGA ANAMNESE — OS 14 BLOCOS (a espinha do desenho)

| Bloco | Conteudo resumido | O que aciona no motor |
| :--- | :--- | :--- |
| A. Identificacao e contexto | idade, sexo biologico, ancestralidade, profissao, escolaridade | perfil de risco; farmacogenetica |
| B. Queixa principal + HMA | OPQRST, intensidade 0-10, evolucao, o que ja tentou | suspeita central |
| C. Revisao por sistemas (ISDA) | 13 aparelhos, um a um | mapeia sintoma -> bloco |
| D. Antecedentes patologicos | doencas cronicas + CID + ano + controle | doenca -> bloco direto |
| E. Cirurgias e internacoes | datas, complicacoes, anestesia | risco peri-operatorio |
| F. Alergias e reacoes adversas | medicamento/alimento/ambiental + tipo | seguranca da prescricao |
| G. Medicacoes e suplementos em uso | doses, adesao, fitoterapicos | interacoes |
| H. Imunizacoes | calendario e reforcos | prevencao |
| I. Habitos e estilo de vida | tabagismo, etilismo, sono, dieta, atividade, estresse | grandes gatilhos de gravidade |
| J. Historia familiar (heredograma) | 1o grau: cardio, cancer, diabetes, autoimune, psiquiatrica, neuro | sobe grade de blocos hereditarios |
| K. Psicossocial e ocupacional | exposicoes, suporte, espiritualidade, seguranca | eixo mente-corpo; toxicos |
| L. Gineco-obstetrica / andrologica | ciclo, menopausa, gestacoes; prostata, funcao eretil | blocos gonadal/hormonal |
| M. Eixos da medicina funcional | digestao, imunidade, energia, detox, hormonios, mente-corpo | correlacao integrativa |
| N. Preferencias terapeuticas e financeiras | entrega, forma, investimento | ja existe — manter |

Frase de chamada: o bloco C (revisao por sistemas) e o coracao da ampliacao —
e por ele que sintoma vira bloco de exame.

---

## 3. ESCALAS VALIDADAS A EMBUTIR (cada uma devolve um numero p/ o escore)

| Escala | Para que serve | Saida |
| :--- | :--- | :--- |
| PHQ-9 (rastreio de depressao, 9 perguntas) | humor | 0 a 27 |
| GAD-7 (rastreio de ansiedade, 7 perguntas) | ansiedade | 0 a 21 |
| AUDIT-C / CAGE (rastreio de alcool) | etilismo | AUDIT-C 0-12 / CAGE 0-4 |
| Epworth (sonolencia diurna) | sono/apneia | 0 a 24 |
| Bristol (forma das fezes, tipos 1-7) | funcao intestinal | 1 a 7 |
| IPSS (sintomas da prostata, homem) | prostata | 0 a 35 |
| OPQRST | caracterizar a queixa | qualitativo + 0-10 |

---

## 4. MODELO DE DADOS (ADITIVO — nunca dropar; regra de ouro do CEO)

Blueprint da ampliacao:

anamnese_questionario (ja existe, 19 linhas)
-> ACRESCENTAR colunas: sistema, escala_validada, peso_gravidade, e_sinal_alarme, opcoes (jsonb)
-> NOVA tabela M:N pergunta_sintoma (pergunta -> sintoma[s])
-> NOVA tabela M:N pergunta_doenca (pergunta -> doenca[s])
-> NOVA tabela M:N item_doenca (item terapeutico -> doenca[s] = casos indicados)
-> NOVA tabela M:N item_sintoma (item terapeutico -> sintoma[s] = objetivos)
-> NOVA tabela anamnese_resposta (resposta do cliente, por sessao)
-> NOVA tabela motor_escore_bloco (escore calculado por bloco, por anamnese)
-> NOVA tabela motor_sugestao (pacote sugerido em AGUARDA_VALIDACAO)
-> NOVA tabela motor_sugestao_item (cada exame/formula/injetavel sugerido)
-> NOVA tabela motor_delegacao (quem delegou, p/ quem, modo, auditoria)

### 4.1 Colunas novas em anamnese_questionario

| Coluna nova | Tipo | Funcao |
| :--- | :--- | :--- |
| sistema | text | qual aparelho da revisao (bloco C) |
| escala_validada | text | PHQ9/GAD7/AUDITC/EPWORTH/BRISTOL/IPSS/OPQRST |
| peso_gravidade | integer | quanto a resposta pesa no escore do bloco |
| e_sinal_alarme | boolean | marca red flag (perda de peso, sangramento, etc.) |
| opcoes | jsonb | alternativas de resposta + peso de cada uma |

### 4.2 Tabelas M:N de amarracao (todas com par unico)

| Tabela | Chave natural (par unico) | Liga |
| :--- | :--- | :--- |
| pergunta_sintoma | (pergunta_id, sintoma_codigo) | anamnese_questionario x catalogo_sintomas |
| pergunta_doenca | (pergunta_id, doenca_id) | anamnese_questionario x catalogo_doencas |
| item_doenca | (item_id, doenca_id) | item terapeutico x catalogo_doencas |
| item_sintoma | (item_id, sintoma_codigo) | item terapeutico x catalogo_sintomas |

Frase de chamada: assim o motor para de depender de casar texto fragil — ele
encontra os itens pela RELACAO editavel (clica e amarra).

---

## 5. ESCORE DE GRAVIDADE POR BLOCO (o calculo)

Regra-chave do CEO: o escore e POR BLOCO. Cada bloco abre na sua propria grade.

| Fator | Efeito no escore do bloco |
| :--- | :--- |
| Intensidade do sintoma (leve/moderado/grave) | +1 / +2 / +3 |
| Numero de sistemas afetados | cada sistema extra soma no bloco correlato |
| Sinal de alarme (e_sinal_alarme = true) | +5 e marca bloco oncologico |
| Comorbidade / dano de orgao-alvo (ex.: diabetes + rim) | +3 no bloco do orgao atingido |
| Exame previo ja alterado | +3 no bloco daquele exame |
| Escala validada acima do corte (ex.: PHQ-9 >= 10) | soma a faixa no bloco correlato |

Mapa escore -> grade (a escada de importancia, ja travada na Onda 1):

| Faixa de escore do bloco | Grade aberta |
| :--- | :--- |
| 1 a 2 | GRADE BASICA |
| 3 a 5 | GRADE INTERMEDIARIA |
| 6 a 9 | GRADE SOFISTICADA |
| 10 ou mais | GRADE AMPLIADA |

Blueprint: resposta -> sintoma/doenca -> bloco(s) -> soma escore POR bloco ->
cada bloco abre na grade da sua faixa -> puxa exames na ordem ate a grade ->
acrescenta formula/injetavel amarrados -> pacote AGUARDA_VALIDACAO.

---

## 6. DELEGACAO (3 modos — decisao do CEO travada na CARTA_06)

| Modo | Quem decide | Quando |
| :--- | :--- | :--- |
| Medico no comando (padrao) | o medico clica item a item | rotina |
| Delegar a humano assistente | medico assistente ou enfermeira do sistema | medico ausente |
| Modo automatico | o sistema aceita as sugestoes | confianca total no motor |

LACUNA HONESTA: o IHE tem perfis ricos (medico, enfermeira, validador_mestre)
com flags pode_validar / pode_assinar / pode_bypass / nunca_opera. O Manager so
tem 3 profissionais, todos papel "executor". Para a delegacao funcionar de
verdade, o Manager precisa PRIMEIRO de um modelo de papeis/permissoes. Sem isso,
a delegacao seria ECTOPLASMA. Proponho tabela de permissoes por profissional +
tabela motor_delegacao auditada (quem delegou, p/ quem, modo, quando, o que agiu).

---

## 7. TELA DE SINAPSES (a "Craniotomia") COM PERSISTENCIA

No IHE essa tela e ectoplasma (roda em dado falso e nao grava). No Manager ela
deve nascer ja gravando: o grafo (doenca <-> bloco <-> exame <-> item) le das
tabelas reais (catalogo_doencas, catalogo_blocos, catalogo_bloco_exames, e as
M:N da secao 4) e toda edicao por clique faz INSERT/UPDATE/DELETE de verdade nas
M:N. Nada de _mockData.

---

## 8. CLASSIFICACAO HONESTA DO LADO MANAGER (REAL / PARCIAL / ECTOPLASMA)

| Peca | Classificacao | Por que |
| :--- | :--- | :--- |
| Catalogos (exames, blocos, grade, doencas) | REAL | importados e conferidos na Onda 1 |
| anamnese_questionario (19) | PARCIAL | existe mas rasa; falta os 14 blocos |
| catalogo_sintomas (10) | PARCIAL | precisa enriquecer |
| escore de gravidade por bloco | ECTOPLASMA (a construir) | desenhado, ainda nao codado |
| amarracao M:N item<->doenca<->sintoma | ECTOPLASMA (a construir) | desenhado, ainda nao codado |
| delegacao 3 modos | ECTOPLASMA + LACUNA de papeis | falta modelo de permissoes |
| tela de sinapses (Craniotomia) | ECTOPLASMA (a construir) | nao existe no Manager |

---

## 9. PROVA / ENTREGA (regra de ferro cross-repo)

O agente (eu) NAO faz git push para o GitHub (limite do ambiente isolado). A
prova desta etapa e este documento versionado no repositorio Protocolo-Manager +
o hash do checkpoint Replit. O push para o GitHub e do Dr. Code, pela aba Git.

RESUMO EM 1 LINHA: desenho da mega-anamnese (14 blocos, escalas, modelo aditivo,
escore por bloco, delegacao, amarracao M:N e sinapses persistentes) entregue em
teste cego; construcao das tabelas aguarda o martelo do CEO porque o conteudo
clinico e decisao medica dele.
