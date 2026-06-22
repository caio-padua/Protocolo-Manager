---
name: Rebrand de marca vs identificadores técnicos
description: Ao trocar a marca de um produto inteiro, separar texto client-facing de chaves técnicas que NÃO podem mudar.
---

# Rebrand global: marca client-facing x identificadores técnicos

Ao fazer um rebrand de produto que varre todo o código (telas + documentos emitidos),
classifique cada ocorrência da marca antiga em DOIS baldes antes de substituir:

**Trocar (texto/marca visível ao usuário ou em documento emitido):**
- Wordmarks, taglines, rodapés, masthead de e-mail, assuntos de e-mail.
- `calName` / `X-WR-CALNAME` / `SUMMARY` / `PRODID` de .ics (são exibidos no calendário do cliente; PRODID é só metadado, seguro mudar).
- Nomes de arquivo em `Content-Disposition` (vazam a marca no download).
- Textos de alerta/notificação (mesmo internos à equipe).

**Preservar (identificador técnico — quebra se mudar):**
- UID de evento .ics (ex.: `...-session-N@dominio`) — chave de deduplicação; mudar = eventos duplicados no calendário do cliente.
- Nomes de coluna / campos de dado (ex.: `codigoPadcom` / `codigo_padcom`).
- Nome de pacote do workspace (`@workspace/<nome>`), tokens de auth, classes CSS, rotas demo.

**Why:** numa varredura por `rg`, o nome da marca aparece tanto em texto quanto em
chaves técnicas. Trocar uma chave técnica (UID, coluna, package) introduz bug silencioso
que só aparece em produção (eventos duplicados, dedup quebrada, import quebrado).

**How to apply:** rode o `rg` da marca antiga, depois filtre os identificadores técnicos
conhecidos com `rg -v`. O que sobra é candidato a troca; revise um a um. Confirme documentos
emitidos VISUALMENTE (renderize o PDF), não só por HTTP 200. QR + selo de marca em PDF: gere
best-effort em try/catch para a emissão nunca quebrar se a lib de QR falhar.
