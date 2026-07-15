# Spec — Faixa de exame por sexo (toggle Masculino/Feminino)

Data: 15/07/2026 · Autor: Dr. Replit Paxter · Decisao do CEO Dr. Caio (onda propria, opcao A)

## Objetivo (uma frase)
Permitir que um analito de exame guarde faixas de referencia diferentes por sexo
(homem x mulher), para que hormonios sexo-dependentes (testosterona, estrona, LH,
SHBG, etc.) mostrem o valor normal correto conforme o sexo do cliente.

## Por que
O esquema atual guarda UMA faixa por analito. Para hormonios sexo-dependentes,
faixa unica da resultado clinicamente errado. 13 analitos estao parados por isso.

## Modelo de dados (minimo, sem quebrar chaveFaixa)
1. `exam_analyte_ranges`: ADD COLUMN `sex` text NOT NULL default 'any'
   (valores: 'any' | 'male' | 'female'). A chave logica da faixa passa a ser
   (analyte_code + sex + ordem). NAO muda `chaveFaixa` (continua amarrando por
   analyte_code); o `sex` e uma dimensao a mais dentro do mesmo analito.
2. `exam_analyte_catalog`: ADD COLUMN `sex_dependent` boolean NOT NULL default false.
   Liga o toggle na tela e diz ao leitor de resultado para escolher o conjunto por sexo.
3. Zero perda: faixas ja gravadas ficam com sex='any' (backfill implicito pelo default).

## Comportamento da tela (Console de Exames, editor das 5 faixas)
- Toggle "Varia por sexo?" (grava `sex_dependent`).
  - DESLIGADO: uma coluna unica de 5 faixas (sex='any'), como hoje.
  - LIGADO: duas colunas completas lado a lado — MASCULINO e FEMININO — cada uma
    com as 5 faixas (nome+low+high+cor). A direcao favoravel e unica (nao muda por sexo).
- Melhoria sobre a ideia inicial (so "opcao mulher"): mostrar as DUAS colunas,
  porque homem e mulher tem valores proprios; nao e override so da mulher.

## Leitura do resultado do cliente
- Ler o sexo do cliente em `clients.ficha_clinica.sexo` ('M' | 'F').
- Se o analito e `sex_dependent`: escolher o conjunto ('male' se M, 'female' se F).
  Se faltar o conjunto do sexo, cair para 'any' (e, se vazio, para as faixas calculadas).
- Se NAO e sex_dependent: usar 'any' como hoje.
- Cliente sem sexo cadastrado: usar 'any' e (a definir) sinalizar "informar sexo".

## API (usar rota existente PUT /faixas, so estender o contrato)
- PUT /exames-lab/faixas aceita campo opcional `sex` ('any'|'male'|'female') e
  `sexDependent` (boolean). Grava as 5 faixas daquele sexo (replace por analyte+sex).
- GET /exames-lab/faixas e /catalogo-faixas retornam as faixas agrupadas por sexo
  + o flag sex_dependent, para a tela reidratar as duas colunas.
- Contrato OpenAPI atualizado + codegen (nao inventar rota nova).

## Curadoria dos 13 (o CEO pediu: pesquisar como especialista e preencher)
Preencher faixas MASCULINO e FEMININO (adulto) para: Testosterona Livre Calculada,
Testosterona Biodisponivel, FAI, ACTH, Estrona, IGF1, SDHEA, Progesterona, SHBG,
LH, Estriol Livre, Leptina, TESTL. Fonte: laboratorios premium (Fleury, DASA,
Hermes Pardini) e sociedades (SBEM/SBAC). Hormonio de ciclo (progesterona, LH,
estradiol/estrona) tem faixa que varia por FASE do ciclo — nesta onda usar faixa
de adulto por sexo; fase do ciclo fica como divida tecnica anotada.

## PRONTO
- Coluna `sex` e `sex_dependent` no banco (dev) com default seguro (zero perda).
- Toggle na tela grava e reidrata duas colunas.
- Leitor de resultado escolhe conjunto por sexo do cliente, com fallback 'any'.
- Os 13 hormonios curados com faixa masculina e feminina; lacuna de sangue = 0.
- Revisao architect sem pendencia tecnica.

## Linhas vermelhas
1. NAO mudar `chaveFaixa` (continua por analyte_code).
2. NAO truncar exam_results nem exam_analyte_ranges (faixas 'any' preservadas).
3. NAO fabricar valor: faixa por sexo sai de fonte laboratorial reconhecida.
4. Fase do ciclo menstrual NAO entra nesta onda (anotar como divida).
