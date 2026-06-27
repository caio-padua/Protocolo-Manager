# Spec — Mínimo Motor de Cadastro Vinculado à Clínica + Foto do Cliente

Data: 27/06/2026 — CEO Dr. Caio. Loop: Especificar (este arquivo) → Construir → Revisar (architect).

## Objetivo (uma frase)
Dentro do cadastro do cliente, ligar cada cliente a uma clínica de origem (lista suspensa
alimentada pela tabela de clínicas, autopreenchendo Instituto Pádua) e dar uma ferramenta de
foto de perfil que o próprio cliente preenche por um link/e-mail, caindo direto no cadastro.

## Requisitos exatos
1. Coluna `locationId` (clínica de origem) na tabela `clients`; toda linha existente recebe
   Instituto Pádua (id 8) no backfill; cadastro novo já entra com Instituto Pádua por padrão.
2. Coluna `photoUrl` (foto de perfil servível) na tabela `clients`.
3. No formulário de cadastro (criar e editar) há um campo "CLÍNICA DE ORIGEM" = lista suspensa
   (Select) alimentada por GET das clínicas ATIVAS (`locations.active = 'true'`), no estilo 3D
   Paxter (campo gravado). Default = Instituto Pádua.
4. Regra do dropdown: só lista clínicas ATIVAS (a lista cresce quando se cadastra/ativa uma
   clínica; "remover" = inativar, nunca apagar). Se o cliente aponta para uma clínica já inativa,
   o nome dela ainda aparece selecionado no formulário daquele cliente (não se perde o vínculo).
5. No formulário há uma ÁREA DE FOTO: mostra a foto de perfil atual (ou um placeholder neutro) e
   um botão "ENVIAR LINK DA FOTO".
6. Ferramenta de link de foto: ao acionar, o sistema gera um link tokenizado (token assinado com
   o id do cliente + validade) e oferece duas formas de entrega: (a) enviar por e-mail responsivo
   (HTML, marca Paxter) e (b) copiar o link para mandar por WhatsApp.
7. Tela pública de foto (mobile-first, marca Paxter, sem barra de admin): o cliente abre o link,
   tira/escolhe a foto e envia. O backend valida o token, salva a imagem no Object Storage e grava
   a URL em `clients.photoUrl` do cliente certo. A foto passa a aparecer no cadastro.
8. Comunicação final ao CEO em Densidade B + RESUMO EM 1 LINHA.

## Casos extremos
- Token de foto expirado/adulterado → recusa genérica, sem vazar quem é o cliente (anti-IDOR).
- Cliente sem clínica (linha antiga sem backfill) → tratado pelo backfill para Instituto Pádua.
- Clínica inativa selecionada no cliente → continua visível no Select daquele cliente.
- Arquivo enviado que não é imagem (ou grande demais) → recusa com mensagem clara.
- Reenvio de foto → substitui a `photoUrl` (a última vale).

## Definição de PRONTO
- `locationId` e `photoUrl` existem em `clients`; todos os clientes existentes = Instituto Pádua.
- Form de criar/editar mostra o Select de clínica (default Instituto Pádua) e a área de foto.
- Botão envia e-mail responsivo E gera link copiável.
- Tela pública de foto sobe a imagem; ela aparece no cadastro (verificado de verdade).
- Uma foto REAL foi colocada e salva no cadastro do próprio Dr. Caio e mostrada no Canvas.
- architect aprova requisito por requisito, zero pendência.

## Linhas vermelhas
- NÃO tocar no motor de orçamento (`/api/budgets/calculate`) nem no de desmembramento.
- NÃO apagar/truncar `clients` nem `locations` (regra de ouro: zero perda).
- NÃO usar o `unidade_id` do export do IHE como verdade (é erro de cadastro — todos Instituto Pádua).
- NÃO inventar autenticação nova para o app inteiro; o portal de foto usa token assinado por link.

## Decisões técnicas assumidas (autonomia; anunciar ao CEO)
- Foto vai para Object Storage (servível inline), não Google Drive, porque a foto precisa aparecer
  dentro da tela. (Opcional futuro: também copiar para a subpasta FOTO PERFIL do Drive.)
- Reusar a infraestrutura do portal (`/api/client-portal`) e o `email-service` já existentes.
- Token de foto = assinado (HMAC) com clientId + validade, validado no upload (padrão anti-IDOR já
  usado no portal).

---

# ONDA 2 — Foto enquadrada, marca na comunicação, painéis 3D, câmera mobile e Agenda Preferencial

Data: 27/06/2026 — CEO Dr. Caio. Extensão da spec acima (mesmo motor de cadastro/foto). Loop:
Especificar (esta seção) → Construir → Revisar (architect). O CEO pediu para construir tudo de
uma vez, testar em todas as plataformas e entregar 100% funcional, sem perguntar.

## Objetivo (uma frase)
Deixar a foto do cliente sempre ENQUADRADA (nunca círculo), aplicar a marca PAXTER oficial da skill
(parte escura/navy, com brilho e a frase em inglês) na comunicação de foto, vestir a área de foto
com os controles 3D corretos da skill, fazer a captura de foto funcionar de verdade no celular
(Safari/Chrome/iPhone/Android, inclusive câmera ao vivo) e acrescentar ao cadastro a AGENDA
PREFERENCIAL (uma ou mais agendas disponíveis da clínica de origem).

## Requisitos exatos (Onda 2)
9.  FOTO ENQUADRADA: toda exibição de foto de cliente é um QUADRADO de cantos sutis (radius 6px),
    NUNCA círculo. Vale para o card de foto do cadastro (`photo-card.tsx`) e para a prévia da tela
    pública (`foto.tsx`). A imagem preenche o quadrado por `object-cover` (pega a parte central).
10. MARCA NA COMUNICAÇÃO (parte escura da skill): a tela pública `/foto` usa o conjunto da marca
    pela FONTE ÚNICA `PaxterLockup` com `tone="dark"` e `showTagline` (símbolo de vidro + "PAXTER"
    em ouro 3D com a luz/glint em cascata + a frase em inglês "Clinical Intelligence System"). O
    e-mail responsivo de foto usa fundo navy (terno azul-marinho) + wordmark em ouro (degradê) + a
    frase em inglês. PROIBIDO recriar o wordmark à mão ou usar texto chapado "PAXTER".
11. PAINÉIS E BOTÕES 3D: a área de foto (card do cadastro e tela `/foto`) usa as classes da skill:
    botões de ação em ALTO-RELEVO (`btn-3d` / `bevel-3d`), nunca o "vitrificado" `btn-3d-soft`;
    painéis com degradê/sombra ACIMA do terno navy (`panel-3d` na variante escura) e os campos de
    informação em INSET gravado (`concave-3d` / `field-engraved`). O degradê fica no que está ACIMA
    do terno, nunca no próprio terno navy.
12. CADASTRO — AGENDA PREFERENCIAL (multi-agenda):
    a. Mantém "CLÍNICA DE ORIGEM" (local de origem, ligado à empresa) como campo gravado.
    b. NOVO campo "AGENDA PREFERENCIAL": lista as AGENDAS DISPONÍVEIS da clínica selecionada (agenda
       = profissional × clínica, fonte = `agenda_resources` ativos daquele `locationId`). O cliente
       pode marcar MAIS DE UMA (ex.: Dr. Caio no Tatuapé E a enfermeira local do Tatuapé).
    c. É DATA-BOUND: trocar a clínica de origem troca a lista de agendas oferecidas.
    d. Persistência: tabela de junção `client_preferred_agendas` (clientId, agendaResourceId, par
       único). Criar/editar cliente aceita a lista de ids; ler cliente devolve a lista.
    e. Estilo: insets gravados; cada agenda é um item marcável (caixa em sulco), conforme skill.
13. CÂMERA EM TEMPO REAL + CROSS-BROWSER: a tela `/foto` funciona em Safari, Chrome, iPhone e
    Android, inclusive em navegador embutido (abertura via WhatsApp):
    a. Captura AO VIVO via `getUserMedia` (vídeo + botão "tirar foto" → `canvas` → arquivo), com
       tratamento de permissão negada e botão para fechar a câmera.
    b. Input de arquivo SEM `capture` forçado (deixa o iOS abrir a folha nativa Tirar Foto /
       Biblioteca / Arquivo). O `capture="user"` atual é causa provável da falha no iPhone/Chrome.
    c. Se `getUserMedia` falhar (navegador embutido bloqueia), faz fallback para o input de arquivo
       e mostra aviso curto para abrir no Safari/Chrome.
    d. Aceitar HEIC/HEIF do iPhone (backend já aceita imagens).

## Casos extremos (Onda 2)
- Clínica sem nenhuma agenda cadastrada → o campo Agenda Preferencial mostra estado vazio claro
  ("Nenhuma agenda nesta clínica"), sem quebrar o formulário.
- Cliente já tinha agenda preferencial de uma clínica e troca de clínica → as marcações que não
  pertencem à nova clínica saem da seleção (coerência data-bound).
- `getUserMedia` indisponível/negado → cair no input de arquivo, sem travar.
- Foto enviada em HEIC → upload aceito; a prévia pode não renderizar em alguns navegadores, mas o
  envio conclui (o backend guarda o arquivo).

## Definição de PRONTO (Onda 2)
- Nenhuma foto redonda em tela alguma; todas enquadradas (radius 6px).
- `/foto` mostra o `PaxterLockup` dark com glint + a frase em inglês sobre o navy; e-mail idem
  (navy + ouro + frase em inglês).
- Botões da área de foto em alto-relevo (`btn-3d`/`bevel-3d`); painéis e insets pela skill.
- Cadastro grava e relê uma ou mais agendas preferenciais, data-bound à clínica (criar e editar).
- `/foto` captura ao vivo funciona e o input não força a câmera; validado por screenshot mobile.
- architect aprova requisito por requisito, zero pendência.

## Linhas vermelhas (Onda 2)
- NÃO inventar estilo fora da `skill-layout-paxter`: usar as classes existentes (`btn-3d`,
  `bevel-3d`, `panel-3d`, `concave-3d`, `field-engraved`) e o `PaxterLockup` (fonte única) — nunca
  recriar o wordmark à mão.
- NÃO tocar no motor de agenda (cálculo de slots / anti-ilha). A Agenda Preferencial só LÊ os
  `agenda_resources` para listar; é metadado de preferência do cliente, não altera o motor.
- NÃO truncar/alterar dados existentes; a tabela de junção só acrescenta.
