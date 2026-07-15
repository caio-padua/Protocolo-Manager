# SPEC — Curadoria em Massa + Faxina Final + Separacao Imagem x Sangue (Paxter Loop)

Data: 15/07/2026. CEO: Dr. Caio. Continuacao da spec `curadoria-universal-exames.md`
(Ondas A, B e C1 ja APROVADAS). Esta spec cobre as tres frentes pedidas:
frente 3.1 (curadoria em massa C2), frente 3.2 (faxina + teste final C3) e
frente 4.1 (separar exame de imagem/composicao corporal do analito de sangue).

## Objetivo (uma frase)
Deixar o catalogo de exames COMPLETO e limpo: cada analito de sangue com nome
usual, apelidos, unidade padrao, 5 faixas e direcao favoravel; e retirar da lista
de analitos tudo que e imagem, composicao corporal ou fragmento de laudo.

## Estado medido em 15/07/2026 (banco de desenvolvimento)
| Medida | Valor |
|---|---|
| Exames ativos no catalogo | 273 |
| Ativos SEM apelido | 195 |
| Ativos SEM unidades | 217 |
| Ativos SEM faixas | 218 |
| Ativos SEM direcao | 218 |

## Principio-mae (do todo ao minimo)
Comecar pelos exames de MAIOR volume real (coluna n = numero de resultados nos
laudos), descendo ate os de 1 resultado. O que tem muito resultado impacta mais
clientes; o de 1 resultado, se for lixo/fragmento, vai para a frente 4.1.

---

## FRENTE 4.1 — Separar imagem/composicao x analito de sangue [PRIMEIRO]

### Por que primeiro
Esses registros nao tem unidade nem faixa de sangue e poluem a curadoria. Tirar
eles da lista ANTES da massa evita gastar esforco em algo que nao e analito.

### Requisitos
1. Nova coluna `kind` (texto) em `exam_analyte_catalog`, valores:
   `blood` (analito de sangue/soro/urina — padrao), `imaging` (medida de laudo de
   imagem: ultrassom, ecocardiograma, dimensoes de orgao), `body_composition`
   (bioimpedancia/antropometria: massa por segmento, dobras, gasto energetico),
   `fragment` (pedaco de laudo que nunca deveria ter virado exame: "Nucleo",
   "Citoplasma", "Ratio", "Livre", "Total", "Relacao", "Atividade", "Microrganismo").
   Default `blood`; coluna NOT NULL com default para nao quebrar linhas existentes.
2. Classificar os 273 ativos por `kind` usando lista curada de padroes (nome
   normalizado). Exemplos obrigatorios:
   - imaging: Abdomen, Utero - Dimensoes, Prostata - Medidas, Endometrio - Espessura,
     Raiz Aortica, Atrio Esquerdo..., Fracao de ejecao Teichholz, Residuo vesical...
   - body_composition: Braco Direito, Coxa Direita, Perna Esquerda (kg), Tronco (kg),
     Peito, Pescoco, Quadril, Abdominal (AD), Subescapular (SB), Triceps (TR),
     Z(O) ... (impedancia por segmento), SMM, SMI, PGC (Historico), TMB Previsto,
     VO2, VE, RQ, Gasto energetico total, Controle de Peso, Consumo Gordura,
     Densidade ossea estimada, IMC (Calorimetria Indireta), Ingestao calorica...
   - fragment: Nucleo, Nucleolo, Citoplasma, Envelope nuclear, Aparelho mitotico,
     Ki-67, c-erbB-2, Ratio, Livre, Total, Relacao, Atividade, Microrganismo,
     Outros elementos, Minerais, Leitura do Teste, Celulas epiteliais.
3. `active=false` para todo registro `imaging`/`body_composition`/`fragment` que
   NAO tem resultado clinico util como analito (nao aparece na lista de analitos).
   NAO apagar linha nem mover resultado (zero perda; reversivel por SQL).
4. GET de listagem de analitos (`/exames-lab/...`) passa a devolver `kind` e, por
   padrao, lista so `kind='blood'` ativos. Filtro opcional `?kind=` para ver os
   demais baldes.
5. Linha vermelha: NAO reclassificar como imagem/fragmento nenhum analito de
   sangue legitimo. Em duvida, fica `blood`.

### PRONTO da frente 4.1
- Coluna `kind` existe e populada nos 273.
- Lista de analitos de sangue nao mostra mais Abdomen, Coxa Direita, Nucleo etc.
- Contagem de `blood` ativos cai para o numero real de analitos (meta ~180-200).
- exam_results intacto (23.317).

---

## FRENTE 3.1 — Curadoria em massa (C2) dos analitos de sangue

### Requisitos por exame (so kind='blood' ativo)
Para cada analito, gravar via as rotas JA EXISTENTES (nao criar rota nova):
1. Nome padrao usual de laboratorio premium (PUT /catalogo/renomear quando o nome
   atual estiver feio: "letra e s p a c a d a", CAIXA ALTA crua, com codigo colado).
2. Apelidos exaustivos (PUT /catalogo-faixas/aliases, max 12): siglas, sinonimos
   clinicos, grafias com/sem hifen, "dosagem de", nome IHE.
3. Unidade padrao canonica (fator 1) + ate 4 raras com fator correto
   (PUT /catalogo-faixas/unidades). SO onde ainda nao ha unidade (nao sobrescreve
   curadoria). Unidades = as mais usadas por laboratorios premium (Fleury, DASA,
   Hermes Pardini).
4. 5 faixas de referencia de adulto (PUT /faixas). SO onde ainda nao ha faixa.
5. Direcao favoravel (PUT /faixas, campo direction) conforme Sociedade Brasileira
   de Analises Clinicas (SBAC): higher_better (HDL, testosterona, vit D, B12,
   ferritina, folico...), lower_better (LDL, triglicerides, glicose, ureia,
   creatinina, PCR, acido urico, GGT, homocisteina...), target (eletrolitos, TSH,
   hemograma, hormonios de faixa ideal...). Grava em `direcao_favoravel_exame`.

### Execucao (do todo ao minimo)
- Lotes de ~25, ordenados por volume (n) decrescente.
- Relatorio Densidade B por lote: quantos nomes, apelidos, unidades, faixas,
  direcoes gravados; e o que ficou pendente.
- NUNCA sobrescrever unidade/faixa/direcao ja curada manualmente (idempotente).

### PRONTO da frente 3.1
- Todo analito `blood` ativo com: nome usual, >=1 apelido, >=1 unidade (1 canonica),
  5 faixas nomeadas com valores, direcao preenchida.
- Nenhuma curadoria manual anterior sobrescrita.

---

## FRENTE 3.2 — Faxina final (C3) + teste como usuario

### Requisitos
1. Rodar POST /triagem/backfill apos a massa; grafias que agora casam por
   chaveVariante ou pelos novos apelidos saem da fila.
2. Teste de ponta a ponta navegando a tela (Console de Exames): abrir um exame de
   alto volume, conferir nome/apelidos/unidade/faixas/direcao aparecendo; abrir a
   Sala de Triagem e conferir fila reduzida; conferir que imagem/fragmento sumiu
   da lista de analitos.
3. Relatorio final Densidade B: antes x depois de cada lacuna (apelido, unidade,
   faixa, direcao) e da triagem.

### PRONTO da frente 3.2
- Fila de triagem no menor tamanho possivel (so o que exige olho humano real).
- Screenshot da tela provando um exame curado e a lista sem imagem/fragmento.
- Relatorio antes x depois entregue ao CEO.

---

## Linhas vermelhas (valem para as 3 frentes)
1. NUNCA truncar/apagar `exam_results` (23.317) nem mover resultado fora da rota
   /englobar (que tem desfazer).
2. `chaveFaixa` NAO muda (amarra resultados + faixas + unidades).
3. Nao criar rota nova de gravacao; usar as existentes (renomear, aliases,
   unidades, faixas, englobar, backfill).
4. Nao sobrescrever curadoria manual (idempotencia por "so grava onde vazio").
5. Distincao clinica preservada: T3 Reverso != T3 Livre != Calcitriol (nunca
   colar por variante).

## Definicao de PRONTO (loop inteiro)
| Criterio | Conferido por |
|---|---|
| Requisitos das 3 frentes cumpridos | architect (Fase 3) |
| Execucao real + screenshot da tela | runtime/captura |
| Zero perda de exam_results | contagem antes x depois |
| Nenhuma linha vermelha violada | leitura do diff |
| Relatorio final em Densidade B | replit.md Art.37-51 |

---

## FECHAMENTO (15/07/2026) — politicas de curadoria e estado final

### Antes x Depois (balde blood ativo)
| Momento | Blood ativo | Com lacuna | exam_results |
|---|---|---|---|
| Inicio da onda | 273 (misto) | 158 | 23.317 |
| Apos frente 4.1 (classificacao) | 213 | 158 | 23.317 |
| Apos curadoria + faxina (C2/C3) | 190 | 13 | 23.317 |

101 analitos de sangue curados (unidade+faixas+direcao); 39 nao-sangue reclassificados
para fora do balde ativo; zero perda de exam_results.

### Politica por classe (decisao registrada nesta onda)
| Classe | kind aplicado / acao | active |
|---|---|---|
| Analito de sangue quantitativo | curado (unidade+5 faixas+direcao) | true |
| Imagem / composicao corporal | kind='imaging' / 'body_composition' | false |
| Fragmento de OCR (letra espacada, fracao de HPLC) | kind='fragment' | false |
| Urina / sedimento | kind='urine' | false |
| Sorologia qualitativa (reagente/nao reagente: HIV, sifilis, HBsAg, herpes IgM) | kind='qualitative' — sai do balde numerico | false |
| Hormonio sexo/idade-dependente | PENDENTE decisao clinica do CEO | true |

### Nucleo remanescente (13) — todos sexo/idade-dependentes
Testosterona Livre Calculada (n=128), Testosterona Biodisponivel, FAI, ACTH, Estrona,
IGF1, TESTL, SDHEA, Progesterona, SHBG, LH, Leptina, Estriol Livre.

Motivo de nao curar: o esquema guarda UMA faixa por analito; faixa unica para hormonio
sexo-dependente seria clinicamente errada (Art.47 — nao fabricar). Exige uma das opcoes:
- (A) Nova coluna/feature de faixa por sexo (mudanca de esquema) — onda propria.
- (B) CEO informa as faixas por sexo agora e curamos como faixa "adulto misto" provisoria.
- (C) Reclassificar como kind='hormonio_sexo_dependente' (active=false) ate a feature existir.
