# Spec — Curadoria de Exames à Exaustão + Sala de Triagem + Selo de Origem

Data: 13/07/2026. Autor: Dr. Replit Paxter. Método: Paxter Loop (Especificar -> Construir -> Revisar).
CEO: Dr. Caio. Sistema: Padcon Conect / PAXTER (Manager).

## Objetivo (uma frase)

Absorver à exaustão as centenas de grafias cruas de laudos para dentro do exame padrão certo
(sem NUNCA criar exame duplicado), criar uma Sala de Triagem que trata todo exame não cadastrado
com autonomia (absorve apelido de alta confiança, cria cadastro automático de exame novo, põe o
clinicamente ambíguo em quarentena e ignora o que não é exame) e marcar todo cadastro com um selo
de ORIGEM (DESCOBERTO x CATÁLOGO) em relevo côncavo.

## Vocabulário travado pelo CEO

- Selo de ORIGEM, dois valores: **DESCOBERTO** (garimpado de um laudo, criado automático) e
  **CATÁLOGO** (já da nossa base oficial). Os 57 exames atuais = CATÁLOGO; auto-criados = DESCOBERTO.
- "cliente" (nunca "paciente").

## Linhas vermelhas (clínicas e de projeto)

1. ZERO exame duplicado no cadastro, em hipótese nenhuma (garantia no banco: `code` único).
2. NUNCA fundir como apelido exames CLINICAMENTE DIFERENTES. São exames ÚNICOS, cada um o seu cadastro:
   - Testosterona Biodisponível e Testosterona Livre Calculada (≠ Testosterona Livre e ≠ Total).
   - T3 Reverso (≠ T3 Livre e ≠ T3 Total).
   - 1,25-dihidroxi Vitamina D / Calcitriol (≠ 25-OH Vitamina D).
3. NÃO criar cadastro para o que NÃO é exame: bioimpedância/InBody (Peso, IMC, Massa Muscular,
   Gordura Visceral, Água Corporal, Pontuação InBody, segmentos de membro) e subitens de
   hemograma/urina (Segmentados, Bastonetes, Mielócitos, Blastos, COR, ASPECTO, pH, Nitrito, Bactérias).
4. ZERO perda: a linha crua do laudo (`exam_results.analyte_name_raw`) já é sempre salva; nada é
   descartado. A importação NUNCA falha nem bloqueia por causa de exame desconhecido.
5. Não mudar motor de cálculo/conversão de unidade por estética. Reusar `normalizeAnalyteName`
   (chave de casamento da importação) como identidade e `chaveFaixa` para derivar `code`.
6. Boot NÃO destrutivo: a faxina roda por endpoint sob demanda (idempotente), nunca sobrescreve
   campo editado pela tela em cada boot.

## Requisitos exatos

### FRENTE 3 — Selo de Origem (base para as outras duas)
R1. Adicionar coluna `origin` em `exam_analyte_catalog` (text, default `'catalogo'`; valores
    `'catalogo'` | `'descoberto'`).
R2. Backfill: os 57 exames semeados recebem `origin='catalogo'`.
R3. GET `/exames-lab/catalogo-faixas` passa a devolver `origin` em cada linha de cadastro.
R4. Na tela de cadastro (ConsoleExamesTool, cabeçalho do detalhe) mostrar o selo em relevo côncavo
    (`concave-3d`): "CATÁLOGO" (navy) ou "DESCOBERTO" (ouro/âmbar), MAIÚSCULO, tracking expandido.

### FRENTE 1 — Faxina à exaustão (backfill do que já existe)
R5. Motor único de classificação `classifyRawName(raw, catalog)` que devolve um de:
    `apelido` (alta confiança, code alvo) | `novo` (exame novo distinto) | `ambiguo` (parece variante
    de exame existente) | `nao_exame` (bioimpedância/subitem).
R6. Regras do motor, em ordem de prioridade:
    (a) casa exato com nome/apelido do catálogo -> já conhecido (apelido).
    (b) padrão de NÃO-EXAME -> `nao_exame`.
    (c) TOKEN DE PERIGO clínico presente (biodisponivel, livre calculada, reverso/reverse/t3r,
        "1 25"/dihidroxi/calcitriol) -> `novo` (exame distinto; NUNCA vira apelido).
    (d) após limpar ruído de método (parênteses de sigla, "dosagem de", "pesquisa de", "- soro",
        "- plasma", "serico") casa exato com o catálogo -> `apelido` alta confiança.
    (e) compartilha token forte com um exame existente (mas não é apelido conhecido nem perigo) ->
        `ambiguo` (quarentena A CONFERIR), com `suggestedCode`.
    (f) não compartilha token com nenhum exame -> `novo`.
R7. Endpoint POST `/exames-lab/triagem/backfill` roda a faxina em massa e é idempotente:
    - `apelido`: adiciona a grafia crua como sinônimo do exame alvo (sem colidir com outro exame).
    - `novo`: agrupa as grafias do MESMO teste (mesma chave normalizada) e cria UM só cadastro
      (`origin='descoberto'`, `active=true`, `code=chaveFaixa(amostra)`, todas as grafias como
      sinônimos). `onConflictDoNothing` no `code` garante zero duplicado.
    - `ambiguo` e `nao_exame`: gravam linha em `exam_analyte_triagem` (status `pendente`).
    - Ao fim, backfill de `exam_results.analyte_code` para as grafias que passaram a casar.
R8. Nenhuma grafia some sem destino: toda grafia crua vira apelido, vira cadastro novo, vira linha de
    triagem, ou é marcada não-exame. (Zero perda auditável.)

### FRENTE 2 — Sala de Triagem (tempo real + tela)
R9. Nova tabela `exam_analyte_triagem`: `id`, `normKey` (único), `sampleName`, `occurrences`,
    `kind` (`ambiguo`|`nao_exame`), `suggestedCode` (nullable), `reason` (nullable), `status`
    (`pendente`|`resolvido`, default `pendente`), `resolution` (nullable `apelido`|`novo`|`ignorado`),
    `createdAt`, `updatedAt`.
R10. Hook em `persist.ts`: quando `matchAnalyte` devolve null, aplicar o motor:
    - `apelido` alta confiança -> adiciona sinônimo ao exame alvo e resolve o code da linha.
    - `novo` -> cria cadastro DESCOBERTO (active) e resolve o code.
    - `ambiguo`/`nao_exame` -> faz upsert na `exam_analyte_triagem` (idempotente por `normKey`),
      deixa `analyte_code` nulo. A importação segue sem falhar.
R11. GET `/exames-lab/triagem` devolve: itens pendentes agrupados por `kind` (A CONFERIR / NÃO-EXAMES)
    e a lista de ACHADOS recentes (cadastros `origin='descoberto'`).
R12. POST `/exames-lab/triagem/:id/resolver` com `{ resolution, targetCode? }`:
    - `apelido` (exige `targetCode`): adiciona `sampleName` como sinônimo do alvo + backfill de
      `exam_results` + marca triagem resolvida.
    - `novo`: cria cadastro DESCOBERTO a partir do `sampleName` + backfill + marca resolvida.
    - `ignorar`: marca resolvida com `resolution='ignorado'` (não cria cadastro).
R13. Tela: a lista principal de cadastro (ConsoleExamesTool) mostra SÓ `inCatalog=true` (cadastros
    reais) — os nomes crus saem do bloco de cadastro. Uma seção "Sala de Triagem" mostra A CONFERIR,
    NÃO-EXAMES e ACHADOS, com os botões "Confirmar como novo exame", "É apelido de…" e "Ignorar",
    e um botão "Rodar faxina" que chama o backfill.

## Casos extremos a tratar

- Duas grafias do mesmo teste novo no mesmo lote -> UM cadastro só (clustering por chave).
- Grafia com sigla entre parênteses ("Hormônio Tireoestimulante (TSH)") -> casa em TSH (apelido).
- Token de perigo com overlap de token (ex.: "Testosterona Biodisponível") -> `novo`, nunca apelido,
  apesar do overlap "testosterona".
- Sinônimo que colidiria com outro exame -> recusa a fusão (mantém como ambiguo/erro), nunca mistura.
- Reexecução do backfill -> idempotente (code único, sinônimo dedup, triagem normKey único).
- Exame DESCOBERTO nasce sem faixas/direção curadas -> normal; entra na evolução, curadoria depois.

## Definição de PRONTO

1. `pnpm --filter @workspace/db run push` aplica a coluna `origin` e a tabela `exam_analyte_triagem`.
2. POST backfill executa sem erro; consulta prova: 0 duplicado por `code`; nº de grafias cruas sem
   destino cai para 0 (todas viram apelido, cadastro novo, ou linha de triagem).
3. As 3 travas clínicas conferidas por dado real: biodisponível/reverso/1,25 aparecem como cadastro
   PRÓPRIO (nunca apelido de outro); InBody/subitens de hemograma/urina NÃO viram cadastro.
4. Tela: selo DESCOBERTO/CATÁLOGO visível no detalhe; nomes crus fora do bloco de cadastro; Sala de
   Triagem opera os 3 botões. Screenshot conferido.
5. Revisão do architect requisito por requisito, zero pendência.
6. Comunicação final ao CEO em Densidade B com "RESUMO EM 1 LINHA".
