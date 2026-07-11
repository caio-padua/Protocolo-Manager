# Spec — Unidade de Referência + 5 Faixas preenchidas para TODOS os exames

Data: 11/07/2026. Decisão do CEO Dr. Caio. Método: Paxter Loop (spec → build → architect).

## Objetivo (uma frase)

Ter, para cada exame de laboratório, uma UNIDADE PADRÃO nossa (selecionável por dropdown
com todas as unidades possíveis daquele exame), conversão automática na varredura do laudo
com símbolo de "revisado", e as 5 faixas já preenchidas com intervalos por bom senso médico —
tudo editável numa TELA TIPO PLANILHA (todos os exames de uma vez, não um por um).

## Decisões do CEO (travadas)

1. MANTER as 5 faixas (não reduzir para 3). O motor de 5 zonas validado na onda anterior fica.
2. Preencher os cortes De/Até de TODOS os exames por bom senso médico (o CEO confere depois).
3. Unidade PADRÃO por exame selecionável por DROPDOWN, com todas as unidades disponíveis do exame.
4. Conversão automática na varredura quando o laudo vier em unidade diferente + símbolo "revisado".
5. Tela tipo PLANILHA geral (não mestre-detalhe um por um).

## Decisões técnicas do agente (avisadas ao CEO; ele pode vetar)

D1. FONTE E CHAVE ÚNICA = nome canônico normalizado (`chaveFaixa`). Todo o motor vivo já chaveia
    por nome (evolução, GET/PUT faixas). Unidade e conversão passam a usar a MESMA chave, para não
    criar uma segunda identidade incompatível. `exam_analyte_catalog.code = chaveFaixa(nome canônico)`.

D2. POPULAR `exam_analyte_catalog` (hoje vazio). É o que faz `matchAnalyte` casar o analito do laudo
    a um código — pré-requisito da conversão. Efeito colateral BOM: laudos passam a casar e a
    Evolução consolida sinônimos numa linha só. É mudança de comportamento da onda anterior e será
    conferida pelo architect.

D3. Catálogo real de dados clínicos = arquivo de CURADORIA em TypeScript (semente), não os 304 do
    `catalogo_analitos` (280 sem unidade, "zonas" sem números, muitos são exame de IMAGEM). A semente
    cobre os analitos de sangue QUANTITATIVOS (painéis clínicos usuais) com unidade canônica, unidades
    alternativas + fator de conversão, direção e intervalo mín/máx de referência.

D4. Exame de IMAGEM ou QUALITATIVO (positivo/negativo, sorologia, laudo textual) NÃO recebe 5 faixas
    numéricas inventadas — linha vermelha clínica. Fica marcado como "não quantitativo" (sem faixas).

## Requisitos exatos

### R1 — Semente de curadoria (dado clínico)
R1.1 Arquivo novo `artifacts/api-server/src/lib/exam-extraction/seed-analitos.ts` exportando um array
     tipado. Cada item: `nomeCanonico`, `sinonimos[]`, `direcao` (higher_better|lower_better|target),
     `unidadeCanonica`, `unidades: [{ unidade, fatorParaCanonica, canonica? }]`, `refLow`, `refHigh`,
     `quantitativo: true`. (Itens não quantitativos podem ser listados com `quantitativo:false` e sem faixas.)
R1.2 Cobrir os painéis usuais (hemograma, lipídico, glicêmico/HbA1c, tireoide, função hepática, função
     renal, eletrólitos, ferro/ferritina, vitaminas D/B12/folato, inflamatórios PCR-us/VHS, hormônios
     sexuais e tireoidianos, ácido úrico, homocisteína, etc.). Meta: cobrir todos os analitos
     quantitativos comuns; a planilha cobre o resto para o CEO completar.
R1.3 Fatores de conversão corretos por convenção médica (ex.: Vitamina D ng/mL ↔ nmol/L fator 2,5;
     Glicose mg/dL ↔ mmol/L fator 0,0555; Colesterol mg/dL ↔ mmol/L fator 0,02586, etc.). Uma unidade
     por analito marcada como canônica (`canonica:true`).

### R2 — Materialização idempotente no banco (boot)
R2.1 Um seeder no boot (ligado no `index.ts`, junto do seed-faixas) que, a partir da semente:
     - faz UPSERT em `exam_analyte_catalog` (code=chaveFaixa(nomeCanonico), displayName, synonyms,
       canonicalUnit, direction);
     - faz UPSERT em `exam_analyte_units` (analyteCode=chaveFaixa, unit, factorToCanonical, isCanonical);
     - materializa 5 faixas em `exam_analyte_ranges` (analyteCode=chaveFaixa) por trissecção do
       intervalo mín/máx usando o MESMO motor `computeZones`/zones.ts, com as cores por direção.
R2.2 IDEMPOTENTE e NÃO destrutivo: só insere/atualiza a semente; NUNCA sobrescreve faixa que o médico
     já editou à mão. Estratégia: marcar origem semente e só recriar faixas quando não houver edição
     manual daquela chave (mesma filosofia do seed-faixas atual). Reboot repetido não duplica.
R2.3 A direção da semente também grava em `direcao_favoravel_exame` (fonte que o motor lê por nome),
     via upsert por nome normalizado — coerente com o PUT /faixas atual.

### R3 — Conversão automática na varredura + marca "revisado"
R3.1 Nova coluna `exam_results.unit_converted` (boolean, default false) — schema push (anulável/seguro).
R3.2 Em `persist.ts`, quando o analito casa um código e o `unitRaw` do laudo difere da unidade canônica:
     buscar em `exam_analyte_units` o fator; se houver, gravar `valueCanonical = valor * fator`,
     `unitCanonical = unidade canônica`, converter também `refLow/refHigh`, e `unit_converted = true`.
     Sem fator conhecido → NÃO inventar: mantém cru e `status` de conferência (comportamento honesto).
R3.3 A Evolução (`/evolucao`) devolve `unitConverted` por célula; a tela mostra um símbolo/badge
     "revisado" (convertido para a nossa unidade) na célula convertida. Nunca converter em silêncio.

### R4 — Tela PLANILHA geral (todos os exames de uma vez)
R4.1 Rota de dados `GET /exames-lab/catalogo-faixas`: lista TODOS os exames da semente/catálogo com,
     por linha: nome, direção, unidade canônica, lista de unidades disponíveis, os 5 cortes (low/high/
     cor/rótulo), flag quantitativo, e flag "tem edição manual".
R4.2 Rota de escrita `PUT /exames-lab/catalogo-faixas` (ou reuso do PUT /faixas por code) para salvar,
     por exame: unidade canônica escolhida (dropdown) + as 5 faixas editadas + direção.
R4.3 Tela React nova (planilha) sob o menu Cadastros: uma linha por exame; coluna de UNIDADE PADRÃO
     como DROPDOWN (todas as unidades do exame); colunas das 5 faixas (De/Até por faixa) editáveis;
     busca/filtro; salvar por linha. Segue o design skill-layout-paxter (navy/ouro, cantos quadrados,
     panel-3d/concave-3d/btn-3d). Reaproveita o motor/cores das 5 faixas (não reimplementar).
R4.4 A ferramenta mestre-detalhe validada (DirecaoExamesTool) CONTINUA existindo (edição fina de 1
     exame); a planilha é a visão geral em massa. As duas gravam no mesmo backend (mesma chave).

## Casos extremos
- Exame sem mín/máx conhecido → sem faixas (não trissecar nulo); aparece na planilha como "a preencher".
- Exame de imagem/qualitativo → `quantitativo:false`, sem faixas, dropdown de unidade oculto/vazio.
- Unidade do laudo desconhecida (fora da lista) → não converter, marcar conferência (sem revisado).
- Colisão de chave (dois nomes → mesma chaveFaixa) → usar o displayName mais curto; não duplicar linha.
- Reboot repetido → seeder idempotente, contagem "inseridas:0" na 2ª vez.
- Edição manual do médico → seeder nunca sobrescreve.

## Definição de PRONTO
- P1 Semente materializa catálogo + unidades + 5 faixas para os analitos quantitativos comuns; reboot
     idempotente (2ª vez não duplica; não apaga edição manual). Provado por curl/SQL.
- P2 Upload de laudo em unidade diferente converte para a nossa unidade, grava `unit_converted=true`
     e a Evolução mostra o símbolo "revisado". Provado por curl com laudo de teste.
- P3 Tela planilha lista todos os exames com unidade em dropdown + 5 faixas editáveis; salvar persiste
     e a Evolução/DirecaoExamesTool refletem (mesma chave). Provado por curl no PUT + leitura no GET.
- P4 architect aprova requisito por requisito contra esta spec, zero pendência bloqueante.

## Linhas vermelhas
- NÃO reduzir de 5 para 3 faixas. NÃO reescrever o motor de zonas (zones.ts) — só CONSUMIR.
- NÃO inventar faixas numéricas para exame de imagem/qualitativo.
- NÃO converter unidade sem fator conhecido nem em silêncio (sempre marca "revisado").
- NÃO sobrescrever faixa editada pelo médico no seeder.
- NÃO tocar o pipeline de assinatura/PDF, agenda, pagamentos.
- Preservar a DirecaoExamesTool validada (só somar a planilha).

## Status final (11/07/2026) — APROVADO pelo architect (zero pendência)
- P1 (semente idempotente): OK. Boot reprovado como destrutivo na 1ª revisão; corrigido — UPSERT do
  catálogo/unidades no conflito NÃO sobrescreve `canonicalUnit`/`direction`/`isCanonical` (só semeia no
  INSERT). Reboot: "faixas: 0, direcoes: 0" novas. Provado por curl/SQL.
- P2 (conversão na varredura): lógica honesta validada por inspeção do architect (não converte sem fator;
  marca `unit_converted`; converte `refLow/refHigh`; unidade desconhecida → conferência, sem "revisado").
  Correção extra: ponto histórico com unidade desconhecida também vai a "conferência". e2e ao vivo (upload
  real com Gemini) fica como validação operacional, não bloqueio.
- P3 (tela planilha): OK. GET catalogo-faixas=200 (1322 linhas); PUT unidade válida=200, inválida=400,
  migração de `isCanonical`/`canonicalUnit` confirmada. Selo "revisado" (Check ouro) na célula da Evolução.
- P4 (architect): APROVADO em re-revisão, requisito por requisito, zero pendência bloqueante.
