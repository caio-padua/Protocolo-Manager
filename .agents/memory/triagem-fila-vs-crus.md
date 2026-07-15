---
name: Fila de triagem != todos os resultados crus
description: por que zerar a Sala de Triagem nao zera os exam_results sem analyte_code, e o risco de varrer o resto cegamente
---

Zerar a Sala de Triagem (exam_analyte_triagem status='pendente') NAO significa que todos
os exam_results ganharam analyte_code. A fila so contem grafias que um backfill anterior
mandou para conferencia; grafias importadas depois (ou nunca enfileiradas) seguem com
analyte_code NULL fora da fila.

**Regra:** "resolver a fila" e escopo diferente de "zerar resultados sem code". Reportar os
dois numeros separados; nunca fantasiar que a fila zerada = zero crus.

**Por que nao varrer os crus fora da fila cegamente:** um classificador deterministico por
regex erra em nomes bare ambiguos. Termos de fita de urina bare (pH, NITRITO, COR, ASPECTO,
UROBILINOGENIO) sao urinalise, mas "Glicose", "Hemacias", "Leucocitos", "Densidade" bare sao
sangue-ou-urina (ambiguos) e viram sangue por engano. Variantes de eGFR (CKD-EPI 2009 x MDRD
x afrodescendente x nao-afrodescendente) sao formulas distintas: apelidar uma na outra funde
dado clinico. Esses casos exigem onda dedicada com regras proprias + amostra de validacao
humana antes de execucao em massa.

**Adimensional nao e pendencia:** razoes/indices (TTPA relacao, Apo B/Apo A1, Castelli,
albumina/globulina, ISI) e fita de urina qualitativa nao tem unidade no laudo; canonical_unit
NULL neles e correto, nao lacuna.
