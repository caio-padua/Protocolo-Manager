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

## SEGUNDA TRAVA (comercial): producao exige Plano de API pago na ZapSign
Mesmo com token de producao valido e ambiente correto, CRIAR documento via API em producao retorna
`HTTP 402: "E obrigatorio contratar um Plano de API para utiliza-la em modo producao. Caso seja um teste,
coloque a flag sandbox como true..."`. Ou seja, na ZapSign:
- LER via API (GET /docs) -> funciona so com o token (200), mesmo sem plano.
- CRIAR via API (POST /docs) em PRODUCAO -> exige Plano de API CONTRATADO (402 sem ele).
- CRIAR via API em SANDBOX -> gratuito, mas exige TOKEN de sandbox (o de prod da 403 la).
Os documentos que aparecem no GET foram criados pela INTERFACE da ZapSign (manual), nao provam API de criacao.
**Why:** o 403 do preview enganava; resolver o ambiente so revelou a trava real (plano). Nao prometer
"assinatura via API funcionando" so porque o token le; criar e outra permissao/cobranca.
**How to apply:** para emissao programatica real, o CEO precisa contratar o Plano de API no painel ZapSign;
para so ENSAIAR o motor de ponta a ponta sem custo, usar token de SANDBOX + ambiente sandbox.
