---
name: Select controlado deve nascer com string, nunca com undefined
description: Warning "Select is changing from uncontrolled to controlled" do React ao inicializar um Radix/shadcn Select com valor undefined que depois vira string.
---

# `value={id ? String(id) : undefined}` dispara "uncontrolled to controlled" — usar `""`

Um `<Select value={algo ? String(algo) : undefined}>` nasce **não controlado**
(undefined) e vira **controlado** (string) assim que `algo` é definido — React
avisa "A component is changing an uncontrolled input to be controlled" no
console. Acontece em qualquer Select cujo valor inicial dependa de uma
seleção ainda não feita (seletor de paciente, de cardápio, de alimento num
formulário dinâmico).

O próprio código-base já tinha o conserto certo em outro lugar
(`MontarCardapio`, seletor de alimento por item): `value={l.alimentoId ?
String(l.alimentoId) : ""}` — string vazia, nunca `undefined`.

**Why:** React decide "controlado vs não controlado" pelo tipo do valor na
PRIMEIRA renderização; `undefined` marca não-controlado permanentemente até o
componente remontar. `""` é uma string válida desde o primeiro render (o
Select simplesmente não encontra item com esse valor e mostra o
placeholder), então o componente é controlado desde o início e nunca
transiciona.

**How to apply:** todo `<Select value={...}>` cujo valor pode começar "vazio"
neste código-base deve usar `""` como sentinela de "nada selecionado", nunca
`undefined`/`null` direto na prop `value` (differente do caso já coberto em
`radix-select-onvaluechange-vazio.md`, que é sobre `onValueChange` disparando
"" espúrio no mount, não sobre a prop `value` inicial).
