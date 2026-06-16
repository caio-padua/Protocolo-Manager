---
name: Links publicos de documentos clinicos (IDOR)
description: Como expor PDFs/documentos clinicos que vao por link ao paciente sem vazar dados de outros pacientes
---

# Links publicos de documentos clinicos — evitar IDOR

Qualquer documento clinico (PDF de exames, RAS, protocolo) cujo link e enviado
ao paciente por WhatsApp/e-mail NAO pode ser servido por id sequencial sem
protecao: o link e publico (sem sessao de admin), entao um id como `/file/123`
permite enumerar e baixar documentos de outros pacientes (IDOR — Insecure Direct
Object Reference).

**Regra:** servir por token aleatorio nao-adivinhavel (ex.: `randomBytes(24).toString("hex")`,
48 chars hex), guardado em coluna `token notNull unique`, e validar o formato do
token na rota antes de consultar. Nunca expor a rota por id puro.

**Why:** o link precisa ser publico para o paciente abrir sem login, logo a
unica protecao viavel e tornar a URL impossivel de adivinhar/enumerar.

**How to apply:** ao criar qualquer endpoint GET que sirva documento clinico
destinado a link externo, use `/file/:token` (nao `/:id`). Ex. concreto:
`exam_request_pdfs` serve por `/api/exam-requests/file/:token`.
