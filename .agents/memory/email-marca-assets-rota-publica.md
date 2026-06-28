---
name: E-mail de marca — assets em rota pública sob /api
description: Por que o cabeçalho do e-mail Paxter quebrava e a regra para imagens absolutas em HTML externo (e-mail/Twilio/Telegram).
---

# E-mail de marca: assets precisam de rota pública sob /api

HTML que sai do servidor e é renderizado FORA dele (corpo de e-mail, MediaUrl do
Twilio, sendPhoto do Telegram) só consegue carregar imagem por URL ABSOLUTA. Duas
condições têm de valer juntas, senão o cabeçalho chega quebrado e o servidor não
acusa erro nenhum:

1. A URL tem de incluir o prefixo de montagem do router. Aqui todas as rotas vivem
   sob `app.use('/api', router)`, então `${baseUrl}/brand/x.png` está ERRADO; o
   certo é `${baseUrl}/api/brand/x.png`. `baseUrl` (base-url.ts) é só
   `https://host`, SEM `/api`.
2. A rota que serve a imagem tem de estar registrada ANTES do portão de
   colaborador (collaborator guard) no barril de rotas — provedores externos e o
   cliente de e-mail buscam sem sessão.

**Why:** o casco do e-mail (render-email.ts → paxterEmailShell) apontava para
`/brand/paxter-symbol.png` e `/brand/paxter-wordmark.png` que (a) não tinham `/api`
e (b) nem existiam como rota (só existia o banner). E-mails saíam com símbolo +
wordmark quebrados, sem nenhum erro de servidor.

**How to apply:** ao adicionar imagem em e-mail/mensagem, sirva o PNG por rota
pública dedicada (nome de arquivo FIXO no código — nada de param, evita path
traversal), garanta o asset em `artifacts/api-server/assets/` (build.mjs copia
`assets → dist/assets`), e use `${baseUrl}/api/...`. Para o conteúdo de amostra,
use UMA fonte (sample-doc.ts) tanto na pré-visualização (`GET /api/brand/email-preview`)
quanto no envio de teste, para o que o CEO vê no link ser idêntico ao que chega na
caixa. Em rota de preview prefira `absoluteBaseUrl(req)` a `baseUrlFromEnv()`.
curl 200 no PNG não prova o e-mail: confira o HTML do casco e tire screenshot.
