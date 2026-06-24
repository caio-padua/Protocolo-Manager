---
name: Tema escuro no anamnese-v2 — seletor .dark no mesmo elemento
description: Por que regras `.dark .classe` (descendente) falham silenciosamente na raiz do anamnese-v2 e como blindar.
---

# Tema escuro do anamnese-v2: `.dark` fica no MESMO elemento da classe de feature

A raiz do `anamnese-v2/index.tsx` monta o className como
`` `${themeClass} anamnese-solo ...` `` — ou seja, `dark` (vindo de `useScreenTheme`)
e a classe de feature (`anamnese-solo`) ficam no **mesmo** elemento.

**Armadilha:** uma regra CSS escrita como `.dark .anamnese-solo` (combinador
descendente, com espaço) exige `.anamnese-solo` DENTRO de um ancestral `.dark`.
Como aqui as duas classes estão no mesmo nó, essa regra **não casa** e o estilo
escuro some — caindo na regra base (tema claro). Pode até "parecer" funcionar se
algum ancestral (html/body) também tiver `.dark`, mas isso é frágil e dependente
de onde o tema é aplicado.

**Regra:** para estilos de tema do anamnese-v2, use seletor que cubra os DOIS casos:
`.dark .anamnese-solo, .dark.anamnese-solo { ... }` (descendente + composto no mesmo
elemento). O `.dark.anamnese-solo` (sem espaço) é o que garante a raiz.

**Why:** custou um ciclo de revisão do architect — fundo navy do Canvas não aplicava
de forma confiável porque só existia a versão descendente do seletor.

**How to apply:** ao adicionar QUALQUER aparência dependente de tema na raiz do
anamnese-v2 (ou em telas que põem themeClass e a classe de feature no mesmo nó),
sempre escrever o par de seletores descendente + composto; conferir por screenshot
no tema escuro (o tool de screenshot persiste "dark" na sessão).
