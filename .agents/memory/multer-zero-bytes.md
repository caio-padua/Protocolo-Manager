---
name: multer 0 bytes não rejeita automaticamente
description: multer aceita buffer vazio com MIME válido — guard explícito necessário antes de salvar no Object Storage.
---

## A regra

Após validar o MIME type com `ALLOWED_IMAGE_TYPES[file.mimetype]`, adicionar guard:

```typescript
if (file.size === 0) {
  res.status(400).json({ error: "Imagem vazia — envie um arquivo com conteúdo." });
  return;
}
```

**Why:** multer com `memoryStorage` recebe qualquer `multipart/form-data` sem conteúdo e entrega `file.buffer` com 0 bytes. O Object Storage salva o objeto vazio sem erro, gerando uma "foto" inacessível no banco.

**How to apply:** o guard de `file.size === 0` vai DEPOIS da validação de MIME e ANTES de qualquer query ao banco. A ordem correta é:

1. `runPhotoUpload` (multer) — recebe o arquivo
2. `verifyPhotoToken` — valida token → 401 se inválido (roda ANTES do size check)
3. `file` presente — 400 se ausente
4. `ALLOWED_IMAGE_TYPES` — 400 se MIME não aceito
5. **`file.size === 0`** — 400 se vazio ← este é o guard novo
6. query ao banco e Object Storage

Aplica tanto à rota pública `/upload` quanto à rota admin `/admin-upload`.
