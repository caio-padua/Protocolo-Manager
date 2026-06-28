---
name: ZapSign - token amarra o ambiente (sandbox x producao)
description: Por que assinatura de documento da 403 "API token not found" no preview de dev mesmo com token valido.
---

O adapter ZapSign (lib/assinatura/adapters.ts) escolhe a base URL pelo ambiente:
- `NODE_ENV=production` -> `https://api.zapsign.com.br` (producao)
- qualquer outro (dev/preview) -> `https://sandbox.api.zapsign.com.br` (sandbox)
- override: `ZAPSIGN_BASE_URL` vence os dois.

O dev script do api-server roda `NODE_ENV=development`, entao o PREVIEW (replit.dev) sempre bate no
SANDBOX. Um token de PRODUCAO da ZapSign NAO existe no sandbox -> a ZapSign responde
`403 {"detail":"API token not found..."}`. Igual ao Asaas: o tipo do token amarra o ambiente.

**Provado** testando o mesmo token (decifrado do cofre `zapsign.token`) contra os dois: producao 200,
sandbox 403. Logo 403 "token not found" no preview = token de prod batendo no sandbox, NAO token invalido.

**Why:** evita perder tempo "consertando" codigo/token que estao corretos; o sintoma engana.

**How to apply:**
- Para validar assinatura no PREVIEW com token de producao: setar `ZAPSIGN_BASE_URL=https://api.zapsign.com.br`
  no api-server (CUIDADO: passa a disparar documentos/e-mails/WhatsApp REAIS de producao em dev).
- Alternativa limpa: cadastrar um token de SANDBOX no cofre so para testes de dev.
- Em PRODUCAO (app publicado, NODE_ENV=production) funciona automatico com o token de prod, sem mexer em nada.
- Diagnostico honesto: o cofre guarda valor cifrado (AES-256-GCM, chave por scrypt de APP_ENCRYPTION_KEY ou,
  em dev, fallback SESSION_SECRET); da pra decifrar e provar o ambiente sem expor o token (logar so status HTTP).
