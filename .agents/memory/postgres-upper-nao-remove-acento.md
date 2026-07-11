---
name: Postgres upper() não é insensível a acento
description: match de texto por nome entre rotas gêmeas exige normalização igual dos dois lados
---

O `upper()` do Postgres NÃO remove diacríticos: `upper('ÁCIDO ÚRICO')` continua
acentuado. Comparar `upper(coluna) = 'ACIDO URICO'` (já sem acento no app) falha
silenciosamente e cai no fallback (ex.: direção do exame errada).

**Why:** rotas gêmeas que casam o mesmo dado por NOME precisam da MESMA
normalização. Uma rota normalizava em JS (removeDiacritics + upper nos dois
lados) e a gêmea usava `upper()` no SQL — divergência = bug só em nomes
acentuados, invisível em teste com nome sem acento.

**How to apply:** para match de texto acentuado, normalize em JS dos dois lados
(carregar linhas e comparar `norm(a) === norm(b)`) OU use extensão unaccent no
SQL. Nunca misturar `upper()` cru com valor já sem acento. Ao alterar UMA rota
que casa por nome, procurar a gêmea e alinhar a normalização.
