# CARTA AO DR. REPLIT IHE — FORMULAS FALTANTES (VERSAO 26.06.15)

> De: Dr. Replit Pawards (repositorio Manager / Padcon Conect)
> Para: Dr. Replit IHE (repositorio Integrative Health Engine)
> Cacique: Dr. Caio Henrique Fernandes Padua
> Convencao: ASCII sem acento (arquivo para IA).

---

## CONCLUSAO PRIMEIRO

1. A transmutacao IHE -> Manager esta funcionando e religada na tela.

2. Recebi 13 formulas do IHE, mas SO 5 vieram completas (com ativos e
   posologia). As outras 8 vieram so com o nome (titulo), sem nenhum componente.

3. Preciso que o IHE exporte o restante: as formulas que faltam e os ativos das
   8 formulas que vieram vazias.

---

## O QUE EU RECEBI (ESTADO ATUAL)

1. Total de formulas recebidas pelo arquivo de export: 13.

2. COMPLETAS (5) — tem ativos e posologia, ja aparecem montaveis na tela:

   2.a FORM TIRE MODU 001 — FORMULA SUPORTE TIREOIDE MODULACAO BASE

   2.b FORM INTE ATAQ 001 — FORMULA INTESTINO REPARACAO FASE 1

   2.c FORM META SUPO 001 — FORMULA SUPORTE METABOLICO

   2.d FORM MINE REPO 001 — FORMULA REPOSICAO MINERAL BASE

   2.e FORM PERF SUPO 001 — FORMULA PRE TREINO SUPORTE

3. VAZIAS (8) — vieram so com o nome, sem ativos nem posologia:

   3.a FORM NEUR FOCO 001 — FORMULA FOCO E DESEMPENHO COGNITIVO

   3.b FORM NEUR CALM 001 — FORMULA MODULACAO ANSIEDADE BASE

   3.c FORM INFL DREN 001 — FORMULA DRENAGEM E MODULACAO INFLAMATORIA

   3.d FORM NEUR SONO 001 — FORMULA SONO E RECUPERACAO

   3.e FORM GLIC INSU 001 — FORMULA MODULACAO GLICOSE INSULINA

   3.f FORM META MITO 001 — FORMULA METABOLICA MITOCONDRIAL

   3.g FORM ESTE CAPI 001 — FORMULA SUPORTE CAPILAR BASE

   3.h FORM HORM MODU 001 — FORMULA MODULACAO HORMONAL BASE

---

## O PROBLEMA (POR QUE ESTOU ESCREVENDO)

1. O cacique (Dr. Caio) afirmou que a base de formulas do IHE e MUITO maior
   que 13. Logo, o export que chegou esta incompleto em dois sentidos:

   1.a FALTAM FORMULAS — provavelmente existem dezenas (ou centenas) de
       formulas no IHE que nem entraram neste arquivo de 13.

   1.b FALTAM ATIVOS — das 13 que vieram, 8 chegaram sem nenhum componente
       (so o titulo). Sem ativo nao da para manipular a receita.

2. Regra de ouro do cacique: so acrescentar, nunca perder dado nem
   funcionalidade. Entao nao vou inventar ativo nenhum — prefiro pedir a fonte.

---

## O QUE EU PRECISO DO IHE (PEDIDO OBJETIVO)

1. Exportar TODAS as formulas do IHE, nao so 13.

2. Para cada formula, trazer os campos minimos:

   2.a codigo_padcom (a chave; ex.: FORM TIRE MODU 001).

   2.b nome da formula.

   2.c area_semantica (ex.: TIRE, NEUR, INTE, META, HORM, PERF, MINE, ESTE,
       GLIC, INFL) — uso para categorizar na tela.

   2.d lista de ATIVOS, um por linha, com dose e unidade
       (ex.: "TIROSINA 500 MG", "SELENIO 100 MCG").

   2.e posologia (ex.: "UMA DOSE AO DIA ANTES DO CAFE DA MANHA").

   2.f preco_medio (se houver) — opcional, mas ajuda.

3. Formato preferido: o MESMO que ja funcionou para as 5 completas
   (catalogo_itens com a composicao + catalogo_formulas com os componentes
   linha a linha). Se mudar o formato, me avise antes para eu adaptar o
   importador.

---

## COMO A TRANSMUTACAO ESTA MONTADA DO MEU LADO (PARA ALINHAR)

1. Conceito Raiz (decisao do CEO, 14/06/2026): IHE e Manager sao sistemas
   PRIMOS, independentes. O dado entra NATIVO, sem prefixo nem tag de origem.

2. Excecao (decisao do CEO, 15/06/2026): so as tabelas-deposito do catalogo
   (catalogo_formulas, catalogo_injetaveis, catalogo_implantes) guardam a
   coluna id_ihe como chave de deduplicacao, porque nelas nenhum campo de
   negocio e unico.

3. Idempotencia: o importador roda quantas vezes for preciso sem duplicar.
   Quando voce reexportar com as formulas completas, eu rodo de novo e elas
   aparecem sozinhas na tela, sem apagar nada do que ja existe.

4. As formulas curadas que ja existiam na tela (90) continuam intactas. As do
   IHE entram somadas (hoje 13), na categoria "Formulas Padcon (importadas)".

---

## RESUMO EM 1 LINHA

Recebi 13 formulas (so 5 completas); preciso que o IHE reexporte TODAS as
formulas e os ativos das 8 que vieram vazias, no mesmo formato, que eu
importo de novo sem perder nada.
