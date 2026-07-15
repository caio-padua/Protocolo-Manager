---
name: Curadoria de faixas por classe de analito
description: Regras duráveis ao curar exam_analyte_catalog em massa (balde blood ativo, backfill, hormônio sexo-dependente).
---

# Curadoria de faixas — armadilhas por classe

**Regra 1 — o backfill/triagem cria analito novo com kind default 'blood'.**
Depois de rodar POST /triagem/backfill (ou qualquer criação em massa de analito),
RE-AUDITAR a classificação: itens de composição corporal (Braço, Coxa, Tronco,
Impedância, Peso), urina e fragmentos de OCR entram como kind='blood' e poluem o
balde numérico. Reclassificar para body_composition/urine/fragment (active=false)
ANTES de medir a lacuna, senão o "PRONTO" nunca zera.
**Why:** o default da coluna kind é 'blood'; a triagem não sabe a classe.

**Regra 2 — hormônio sexo/idade-dependente não aceita faixa única.**
Testosterona livre/biodisponível, FAI, estrona, estriol, SDHEA, ACTH, IGF1, LH,
progesterona, SHBG, leptina: o esquema guarda UMA faixa por analito. Curar com
faixa única é clinicamente errado (Art.47 — não fabricar). Deixar pendente até
existir faixa-por-sexo (feature de esquema) ou o CEO informar as faixas.

**Regra 3 — sorologia qualitativa sai do balde numérico.**
HIV, sífilis, HBsAg, herpes IgM (reagente/não reagente) não têm faixa numérica:
kind='qualitative', active=false. Política, não lacuna.

**Regra 4 — distinguir clínico, nunca colar por variante.**
T3 Reverso ≠ T3 Livre ≠ Calcitriol. Frações de HPLC (Hb A1a/A1b/A1c lábil) e
letras espaçadas de OCR = fragment; nunca curar como analito de sangue.
