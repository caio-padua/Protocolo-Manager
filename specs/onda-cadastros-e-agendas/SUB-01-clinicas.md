# SUB-01 — Cadastro de Clínicas (endereços)

Onda: Cadastros e Agendas. Item do CEO: 5.a, 5.b. Data: 20/06/2026.

## Objetivo (uma frase)
Dar ao CEO uma tela para cadastrar, editar, ativar/desativar e apagar as clínicas (endereços onde ele atende), com telefone próprio, reaproveitando a tabela `locations` que já existe.

## Contexto
Hoje `locations` guarda name, address, type, googleCalendarId, color, active — mas não há tela de CRUD dedicada nem campo de telefone. O CEO quer cadastrar endereços além do Instituto Padua (Rua Guaxupé 327, CEP 03416-050).

## Requisitos exatos
1. Acrescentar à tabela `locations` os campos:
   1.1. `phone` (texto, opcional) — telefone/WhatsApp da clínica (formato E.164 sugerido, ex.: +5511977154000).
   1.2. `cep`, `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `estado` (todos texto, opcionais) — endereço decomposto, no MESMO padrão já usado em clientes. O campo `address` existente continua como endereço completo (montado a partir das partes ou digitado).
2. Endereço com auto-preenchimento por CEP (ViaCEP), igual ao cadastro de cliente: ao digitar o CEP, preencher logradouro/bairro/cidade/estado automaticamente.
3. API REST completa para `locations`:
   3.1. `GET /api/locations` (já existe — manter).
   3.2. `POST /api/locations` (já existe — estender com novos campos).
   3.3. `PUT /api/locations/:id` (já existe — estender com novos campos).
   3.4. `DELETE /api/locations/:id` (NOVO) — apaga a clínica. Bloquear (HTTP 409) se houver sessões vinculadas àquela clínica; nesse caso, instruir a desativar (active=false) em vez de apagar.
4. Tela React "Clínicas" no grupo de menu Cadastros (a posição final do item de menu é definida na SUB-03), com:
   4.1. Lista das clínicas em cards no padrão visual Paxter (panel-3d / grade imaginária), mostrando nome, cidade, telefone, status ativo/inativo e a agenda Google vinculada (nome do calendário, quando houver).
   4.2. Botão "Nova clínica" abrindo formulário (Dialog) com os campos acima.
   4.3. Editar e Apagar por card. Apagar pede confirmação textual.
5. Semear (seed) o Instituto Padua como clínica principal com os dados reais informados pelo CEO: nome "Instituto Padua", CEP 03416-050, Rua Guaxupé, número 327, telefone oficial +5511977154000 (se ainda não existir uma location equivalente; idempotente, sem duplicar).
6. Dados fictícios para teste (item 5.b): criar 2 clínicas fictícias completas (nome, endereço e telefone fictícios) para validar o fluxo, claramente marcadas como teste no nome (ex.: "[TESTE] Clínica Vila Aurora").

## Casos extremos
1. CEP inválido/ViaCEP fora do ar -> permitir digitação manual, não travar o cadastro.
2. Apagar clínica com sessões vinculadas -> 409 + mensagem clara (desative em vez de apagar).
3. Telefone em formato livre -> normalizar para E.164 ao salvar quando possível; se não der, salvar como digitado (não bloquear).
4. `active` hoje é texto ("true"/"false") na tabela — manter compatibilidade (não quebrar o que já lê esse campo).

## Definição de PRONTO
1. Migração de schema aplicada (push) sem perda de dados em `locations`.
2. CRUD completo funcionando por curl/runtime (criar, listar, editar, apagar com 409 quando há sessões).
3. Tela Clínicas lista/cria/edita/apaga e o CEP preenche o endereço.
4. Instituto Padua semeado e 2 clínicas fictícias criadas para teste.
5. Aprovação do architect contra esta sub-spec.

## Linhas vermelhas
1. Não truncar nem recriar a tabela `locations`; só ALTER aditivo (campos novos opcionais).
2. Não quebrar quem já lê `locations.active` como texto.
3. Não apagar clínica que tenha sessões (proteção de histórico).

## RESUMO EM 1 LINHA
Tela e API completas de CRUD de clínicas (com telefone e endereço por CEP) sobre a tabela locations existente, com Instituto Padua semeado e clínicas fictícias para teste.
