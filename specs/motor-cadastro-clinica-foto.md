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
