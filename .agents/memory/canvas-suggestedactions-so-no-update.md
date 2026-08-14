---
name: Canvas — suggestedActions e fontSize reprovam na criação de forma
description: Quirk do applyCanvasActions que produz "procedure init failed validation" sem dizer qual campo é o culpado.
---

`applyCanvasActions` devolve apenas `procedure init failed validation`, **sem apontar o
campo culpado**. Dois campos causam isso silenciosamente:

- `suggestedActions` **não é aceito no `create`**, só no `update`. Criar o iframe primeiro
  e aplicar as sugestões numa segunda ação `update` (que exige `shapeType` nos `updates`).
- `fontSize` **não existe no esquema** de nenhuma forma, inclusive texto. `color` é um
  **enum de nomes** (`black`, `grey`, `blue`, …), nunca hexadecimal.

**Why:** a mensagem de erro é genérica e um payload com várias formas reprova inteiro,
o que faz perder tempo procurando no lugar errado.

**How to apply:** quando `applyCanvasActions` reprovar, não reescrever o payload inteiro —
mandar cada forma isolada num `try/catch` para descobrir qual reprova em uma só chamada.
