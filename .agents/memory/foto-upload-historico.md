---
name: Foto upload — validação, histórico e segurança
description: Padrões obrigatórios para upload de foto de cliente (validação 1:1, backup histórico, auth de rotas)
---

## Regras consolidadas — foto de cliente

### Validação 1:1 no servidor (fail-closed)
- `assertSquare()` parseia JPEG (SOF0/SOF1/SOF2), PNG (bytes 16-23), WebP VP8
- Se o formato não pode ser verificado → **rejeitar com 400** (fail-closed), não aceitar
- Tolerância: `abs(width - height) <= 5px`

**Why:** O editor público de crop garante 1:1 no front, mas qualquer chamada direta à rota pode enviar retangular. Fail-closed impede bypass.

**How to apply:** Chamar `assertSquare(file.buffer, file.mimetype, res)` ANTES do backup e do save em TODA rota que receba upload de imagem de perfil.

---

### Ordem de operações no upload
1. Guard de token ou `requireCollaborator`
2. Tamanho de arquivo (multer limit + `file.size === 0`)
3. MIME type permitido
4. `assertSquare` (dimensões 1:1)
5. `await backupFotoAnterior(...)` — fail-safe interno, nunca lança
6. Salvar novo arquivo no Object Storage
7. `db.update(clientsTable).set({ photoUrl })`

**Why:** `void` no backup cria race condition: o banco pode ser atualizado antes do histórico ser gravado. `await` garante preservação antes de sobrescrever.

---

### Auth de rotas de foto
- Rotas de **equipe** (staff): `requireCollaborator` obrigatório
  - POST `/client-photo/send-link/:id`
  - POST `/client-photo/admin-upload/:id`
  - GET `/client-photo/history/:clientId`
- Rotas **públicas** (cliente com token): SEM requireCollaborator
  - POST `/client-photo/upload` (token `verifyPhotoToken`)
  - GET `/client-photo/info` (token `verifyPhotoToken`)

---

### Backup Drive — preservar MIME e extensão originais
- Derivar extensão do `relativePath` (último segmento após `.`)
- Usar EXT_TO_MIME map: jpg/jpeg→image/jpeg, png→image/png, webp→image/webp, heic→image/heic, heif→image/heif
- `fileName = foto-perfil-YYYY-MM-DD_HH-mm-ss.{originalExt}`
- Nunca hardcodar `.jpg`/`image/jpeg` — a foto original pode ser PNG ou WebP

---

### Boot — tabela antes do listen
- `ensurePhotoHistoryTable()` deve rodar em `await` dentro de async IIFE **antes** de `app.listen()`
- Se falhar → `process.exit(1)` (a tabela é crítica para o histórico de uploads)
- Padrão do index.ts: `(async () => { await ensurePhotoHistoryTable(); app.listen(...); })();`

---

### brt.ts — nome da função
- A função que retorna `Date` atual em BRT chama-se **`brtNow()`** (não `nowBRT`)
- Exportações: brtNow, parseBrtParts, brtDateStr, brtISODate, brtDisplayDate, brtDateTime
