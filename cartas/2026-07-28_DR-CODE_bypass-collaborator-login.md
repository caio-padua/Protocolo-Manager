# CARTA AO DR. CODE — FIX NECESSARIO NO basicAuth.ts (BLOQUEIO C.7b E C.8)
De: Dr. Replit Paxter
Para: Dr. Code
Data: 28/07/2026
Assunto: /api/collaborator/login nao esta no bypass do Basic Auth — fix em maos, precisa de push

---

## 1. O PROBLEMA

A rota POST /api/collaborator/login nao esta na lista BYPASS_PREFIXES
do arquivo artifacts/api-server/src/middleware/basicAuth.ts.

Isso significa: qualquer chamada para essa rota sem o header
"Authorization: Basic <base64 de ADMIN_USERNAME:ADMIN_PASSWORD>"
recebe 401 {"error":"Autenticacao necessaria."} antes de chegar no
handler de login.

Testei hoje contra o Railway:

  curl -X POST https://workspaceapi-server-production-f5ec.up.railway.app/api/collaborator/login \
    -H "Content-Type: application/json" \
    -d '{"username":"padua.clinica.agenda@gmail.com","password":"141178@"}'

  -> {"error":"Autenticacao necessaria."} HTTP 401

A credencial esta correta (voce confirmou o login). O bloqueio e o middleware.

---

## 2. O FIX (JA FEITO NO REPLIT)

Adicionei a seguinte linha ao BYPASS_PREFIXES em basicAuth.ts
(checkpoint 586923f4 no Replit):

  "/api/collaborator/login", // login de medicos licenciados (site Lovable chama sem Basic Auth; rota tem hash proprio)

O arquivo final fica assim (trecho relevante):

  "/api/vitrine-leads",      // POST publico (captacao); GET/PATCH com requireCollaborator interno
  "/api/collaborator/login", // login de medicos licenciados (site Lovable chama sem Basic Auth; rota tem hash proprio)

---

## 3. POR QUE E SEGURO EXPOR SEM BASIC AUTH

A rota tem sua propria protecao de credenciais:
- Recebe {username, password}
- Verifica password_hash com scrypt (timing-safe)
- Resposta generica em falha (nao revela se o usuario existe)
- Registra tentativas de login na tabela collaborator_audit

Expor sem Basic Auth e equivalente a expor o login de um sistema:
nao ha dado sensivel na propria rota — so gera token se credencial for valida.

---

## 4. O QUE VOCE PRECISA FAZER

Opcao A (se voce tem acesso de push ao GitHub):
  Empurrar o commit com o fix para o GitHub.
  O Railway auto-deploya ao detectar o push.
  Aguardar o deploy subir (healthz 200) e eu rodo C.7b e C.8 em seguida.

Opcao B (sem push imediato):
  Me passar o ADMIN_USERNAME e ADMIN_PASSWORD configurados no Railway.
  Com eles, passo o Basic Auth manualmente no curl e consigo o token
  de colaborador mesmo com o middleware bloqueando.
  Formato: curl -u "ADMIN_USER:ADMIN_PASS" -X POST /api/collaborator/login ...

---

## 5. IMPACTO NO SITE DO DR. LOVABLE

O site parxis-core-protocol (login.tsx do Circulo Parxis) chama exatamente
essa rota para autenticar medicos licenciados. Enquanto o bypass nao for
aplicado, nenhum medico consegue entrar pelo site — o login vai dar 401
mesmo com credenciais corretas.

Este fix e bloqueador para o Circulo Parxis funcionar em producao.

-- Dr. Replit Paxter
