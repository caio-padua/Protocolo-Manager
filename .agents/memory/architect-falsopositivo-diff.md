---
name: architect pode marcar codigo pre-existente como fora de escopo
description: revisao com includeGitDiff as vezes le linhas antigas do arquivo como se fossem novas; conferir o diff real antes de reverter
---

O architect (code_review) com `includeGitDiff: true` recebe o diff E o conteudo completo dos
`relevantFiles`. Ele as vezes confunde linhas PRE-EXISTENTES do arquivo (que aparecem no
conteudo mas NAO no diff) com mudancas da onda atual, e acusa "fora de escopo".

**Caso concreto:** onda LUXO Editorial Concierge (so layout do DrCaioFlow em agendar.tsx). O
architect deu "Fail (scope compliance)" alegando edicoes de rota `/anamnese/v2` e redirect
`/anamnese` em App.tsx e agendar.tsx. Verificacao na fonte: `git diff` de agendar.tsx NAO tinha
nenhuma linha +/- de anamnese, App.tsx nao tinha diff algum. As referencias eram codigo antigo.

**Why:** seguir cegamente o veredito teria revertido/mexido em codigo que nunca foi tocado,
violando o proprio escopo e a regra do CEO (verificar na fonte antes de afirmar/agir).

**How to apply:** quando o architect acusar algo "fora de escopo" ou "regressao", confira com
`git --no-optional-locks diff -- <arquivo> | grep -nE "^[+-].*<termo>"`. Se o termo nao aparecer
como linha +/- no diff, e falso-positivo: o veredito mira conteudo pre-existente, nao a sua onda.
