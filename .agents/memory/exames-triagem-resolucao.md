---
name: Sala de Triagem — resolução carimba o cluster inteiro
description: Ao resolver uma linha de triagem (dedup por normKey), carimbar TODAS as grafias do cluster, não só a amostra.
---

# Resolução de triagem = cluster inteiro por normKey

A fila `exam_analyte_triagem` deduplica por `normKey` (uma linha representa muitas
grafias cruas que normalizam igual: caixa/pontuação/espaço diferentes). Ao resolver
(apelido/novo), carimbar `exam_results.analyte_code` de TODAS as grafias do cluster,
nunca só do `sampleName` exato.

**Why:** carimbar só o `sampleName` deixa outras grafias do mesmo teste com
`analyte_code = NULL` — viola a linha vermelha "zero perda auditável" e faz o exame
sumir da evolução para aquelas grafias. O backfill em massa já itera todas as
variantes do cluster; a resolução humana tinha o buraco.

**How to apply:** use um helper que busca as grafias `analyte_code IS NULL` cujo
`normalizeAnalyteName(raw) === normKey` e faz `UPDATE ... WHERE analyte_name_raw IN (...)`;
depois absorve cada variante como sinônimo do alvo. Normalização é em JS
(`normalizeAnalyteName`), não dá para replicar fiel em SQL — filtre no JS.
Espelhar as MESMAS ações do backfill (carimbar + sinônimo) no path de resolução.

Cauda conhecida (curadoria futura, não bug de fusão): o motor `nao_exame` não cobre
100% dos itens de bioimpedância/InBody nem subitens de cariótipo (ex.: "Z(Ω) PD",
"Placa metafásica cromossômica" nascem como cadastro DESCOBERTO). Cadastro
DESCOBERTO nasce sem faixa/direção e é curado depois; não confundir com fusão
indevida (linha vermelha), que continua defendida.
