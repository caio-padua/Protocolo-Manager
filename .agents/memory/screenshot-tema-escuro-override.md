---
name: Screenshot do tema escuro exige override do readTheme
description: Como capturar o tema escuro de telas do cliente (agendar/anamnese-v2) que guardam tema em localStorage
---

Telas do cliente (padcom: `/agendar`, `/anamnese/v2`) escolhem claro/escuro via `useScreenTheme`,
que lê `localStorage` (`paxter.theme`, padrão "light"). A ferramenta de screenshot NÃO roda JavaScript
e o navegador dela PERSISTE o `localStorage` entre capturas — então trocar só o padrão do `readTheme`
não muda nada se já houver "light" gravado.

**Regra:** para conferir o tema ESCURO por screenshot, forçar temporariamente `readTheme` a
`return "dark"` (ignorando localStorage), capturar, e **reverter imediatamente** ao original.

**Why:** o toggle de tema fica no header e não é clicável pela screenshot; sem override, você só
vê o tema persistido no navegador da ferramenta.

**How to apply:** editar `artifacts/padcom/src/components/theme/useScreenTheme.ts`, screenshot,
reverter na mesma sessão. Nunca deixar o override commitado.
