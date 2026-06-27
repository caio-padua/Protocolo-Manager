# Spec — Cadastro Público por Voz + Foto (gêmeo do fluxo só-foto)

Data: 27/06/2026. Autor: Dr. Replit Paxter. Loop: Paxter (Especificar → Construir → Revisar).

## 1. Objetivo (uma frase)

Criar um SEGUNDO fluxo público (link pessoal) onde o cliente preenche o CADASTRO COMPLETO
(dados pessoais + endereço + foto) pelo próprio celular, podendo PREENCHER POR VOZ, com máscaras
automáticas, sem mexer no fluxo só-foto existente (`/foto` continua exclusivamente foto).

## 2. Fora de escopo (NÃO fazer)

- Não alterar o comportamento do `/foto` (continua só foto).
- Não criar autenticação de sessão (app é single-tenant atrás de proxy; padrão do repo).
- Não criar campos novos no banco `clients` (todos já existem: name, cpf, email, phone, birthDate,
  address, instagram, comoConheceu, photoUrl, locationId, pais).
- Não mexer no OpenAPI/codegen: o fluxo público usa rotas Express simples + fetch (igual ao `/foto`).

## 3. Requisitos do CEO (verbatim destilado)

1. Fluxo separado do só-foto; `/foto` intocado.
2. Preenchimento por VOZ. DECISÃO TRAVADA: **Opção A — microfone por campo** (mais preciso e à prova
   de erro). O CEO pode trocar depois para B (fala corrida) ou C (ambos). Registrado aqui.
3. Máscaras automáticas enquanto digita/fala:
   - CPF → `000.000.000-00`
   - Data de nascimento → `00/00/0000`
   - Celular → `(00) 00000-0000`
   - CEP → `00000-000` (com auto-preenchimento ViaCEP)
4. Campos OBRIGATÓRIOS (seleção do CEO): **nome, data de nascimento, CPF, e-mail, celular**.
   Todo o resto é OPCIONAL (endereço, instagram, como conheceu, foto, observações? não — observações
   é campo clínico interno, NÃO entra no público).
5. A FOTO faz parte deste cadastro (câmera ao vivo + galeria, igual ao `/foto`).
6. E-mail no padrão Hermes (símbolo de vidro + wordmark PAXTER + frase em inglês), MELHORADO:
   cada frase que termina em ponto final começa em NOVO parágrafo. Resto do layout intocado.
   Aplicar a melhoria também ao e-mail de foto já existente (CEO: "o restante está perfeito").

## 4. Arquitetura (blueprint)

Admin (tela do cliente) -> Botão "Enviar link de cadastro" -> POST /client-registration/send-link/:id
  -> cria token escopo "cadastro" (HMAC, 7 dias) -> e-mail Hermes "Complete o seu cadastro"
  -> devolve { link, emailSent }

Cliente (celular) -> abre /cadastro?token=... -> GET /client-registration/info?token
  -> devolve dados atuais (prefill) + lista de clínicas ativas
  -> preenche (voz por campo + máscaras + foto) -> POST /client-registration/submit (multipart:
     campos JSON + arquivo de foto opcional) -> grava no client -> tela de sucesso

## 5. Backend (artifacts/api-server)

### 5.1 portal-token.ts
- Adicionar `createRegistrationToken(clientId)` / `verifyRegistrationToken(token)` escopo `"cadastro"`,
  TTL 7 dias. Mesmo formato base64url(`cadastro:id:exp:sig`). NÃO reusar escopo "foto".

### 5.2 Novo router `routes/client-registration.ts` (montar em routes/index.ts)
- `POST /client-registration/send-link/:id`: valida id; busca client; cria token; monta link
  `${base}/cadastro?token=...`; se tiver e-mail, envia Hermes `buildRegistrationEmailHTML`; retorna
  `{ link, emailSent, emailError }`. (Espelho de client-photo/send-link.)
- `GET /client-registration/info?token`: valida token (anti-IDOR); retorna `{ name, cpf, email,
  phone, birthDate, address, instagram, comoConheceu, photoUrl, locationId }` para prefill.
- `POST /client-registration/submit`: multipart (multer memory, `file` opcional). Valida token.
  Lê campos do body (strings). Valida obrigatórios no servidor (name, cpf, email, phone, birthDate)
  — endurece o contrato, não confia só na tela. Se vier `file`, valida tipo (mesma allowlist do
  foto), sobe ao Object Storage `uploads/photos/...`, monta photoUrl. `db.update(clients)` com os
  campos preenchidos (só sobrescreve o que veio). Retorna `{ ok: true, photoUrl }`.

### 5.3 E-mail Hermes (mesmo arquivo do router novo)
- `buildRegistrationEmailHTML(clientName, link, baseUrl)`: estrutura IDÊNTICA ao Hermes do foto
  (símbolo `${baseUrl}/brand/paxter-symbol.png`, wordmark `paxter-wordmark.png`, frase
  "Clinical Intelligence System", botão dourado bulletproof). Headline: "Complete o seu cadastro."
  Corpo: cada frase em SEU PRÓPRIO `<p>` (regra do CEO). Botão: "Completar meu cadastro".
- Melhoria do e-mail de foto (`buildPhotoEmailHTML`): quebrar o parágrafo do corpo em um `<p>` por
  frase (mantendo estilos atuais). Nada mais muda.

## 6. Frontend (artifacts/padcom)

### 6.1 Nova página `src/pages/cadastro.tsx` (rota `/cadastro` em App.tsx, junto de `/foto`)
- Casca visual = `foto.tsx`: `<div className="dark min-h-screen bg-[#0d1830]">`, header com
  `PaxterLockup tone="dark"`, classes 3D (`panel-3d`, `concave-3d`, `bevel-3d`, `btn-3d`,
  `field-engraved`).
- Lê token; GET info (prefill + clínicas); estados de loading / inválido / sucesso (igual foto).
- Campos:
  - Obrigatórios: Nome, Data de Nascimento (máscara dd/mm/aaaa), CPF (máscara), E-mail, Celular
    (máscara). Marcados com asterisco e validados antes do envio.
  - Opcionais: CEP (+ViaCEP), Logradouro, Número, Complemento, Bairro, Cidade, Estado, País,
    Instagram, Como nos conheceu (mesmas opções do admin), Clínica de origem (select), Foto.
- VOZ (Opção A): cada campo de texto tem um botão de microfone (ícone) que usa Web Speech API
  (`webkitSpeechRecognition`/`SpeechRecognition`, `lang="pt-BR"`). Ao falar, o texto cai no campo
  já passando pela MÁSCARA daquele campo (CPF/data/telefone/CEP convertem fala "um dois três" ou
  "12345" em dígitos). Campos sem máscara recebem o texto transcrito. Se o navegador não suportar,
  o botão fica oculto/desabilitado com aviso curto (não quebra o cadastro).
- FOTO: mesmo motor do `foto.tsx` (getUserMedia + canvas + fallback galeria), preview enquadrado.
- Envio: monta `address` concatenado (igual `new.tsx`), converte data dd/mm/aaaa → ISO aaaa-mm-dd,
  FormData com campos + `file` (se houver) + `token`; POST submit; tela de sucesso.

### 6.2 Botão no admin
- Em `components/clients/photo-card.tsx` (ou card próximo no detalhe/edição), adicionar botão
  "ENVIAR LINK DE CADASTRO" que chama `POST /client-registration/send-link/:id` e mostra/copa o link
  (espelho do botão de foto). Não remover o botão de foto.

## 7. Critérios de PRONTO (Definition of Done)

1. `/foto` continua funcionando exatamente como antes (nada quebrado).
2. `/cadastro?token=...` carrega, faz prefill, valida obrigatórios, aplica máscaras ao digitar.
3. Microfone preenche pelo menos os campos com máscara (CPF, data, telefone) e os de texto livre.
4. Foto sobe e grava em photoUrl; dados gravam no client (verificado por GET info após submit).
5. Token inválido/expirado → tela "link inválido"; obrigatório faltando → 400 do servidor.
6. E-mail de cadastro chega no padrão Hermes com cada frase em parágrafo próprio; e-mail de foto
   melhorado do mesmo jeito; `/brand/*.png` respondem 200.
7. Botão "Enviar link de cadastro" no admin gera e copia o link.
8. Architect aprova sem pendência (loop Paxter).

## 8. Riscos / armadilhas (memória)

- Web Speech API só funciona em navegador com suporte (Chrome/Edge; Safari iOS tem suporte parcial
  via webkit). Tratar ausência sem quebrar.
- Token de cadastro é escopo próprio; o upload de foto do `/foto` (escopo "foto") NÃO serve aqui.
- Object Storage: servir exige prefixo `uploads/` (memória object-storage-serve-prefixo).
- typecheck GLOBAL pré-quebrado → validar por runtime/curl/screenshot.
- BASE_URL pode sair sem barra → API_BASE = `import.meta.env.BASE_URL.replace(/\/$/, "")`.
- Conferir `/brand/paxter-symbol.png` e `paxter-wordmark.png` = 200 antes de confiar no e-mail.
