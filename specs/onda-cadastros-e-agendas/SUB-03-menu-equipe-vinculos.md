# SUB-03 — Menu Cadastros + Equipe + Vínculos

Onda: Cadastros e Agendas. Itens do CEO: 4.a, 4.b, 4.c. Data: 20/06/2026.

## Objetivo (uma frase)
Organizar o menu "Cadastros" com a equipe em subcategorias (médicos, enfermagem, recepção, administrativo, financeiro, outros) e permitir vincular cada profissional a uma clínica (endereço físico) e a uma agenda Google, preparando o atendimento futuro em outras cidades/bairros com o mesmo Gmail.

## Contexto
O grupo "Cadastros" já existe no sidebar (Layout.tsx) com submenus (Exames & Blocos, Listas). `professionals.role` é texto livre. `location_professionals` já liga profissional a clínica. `agenda_calendars` (SUB-02) guarda as agendas.

## Requisitos exatos
1. Reorganizar o grupo de menu "Cadastros" (Layout.tsx) para conter, além do que já existe:
   1.1. "Clínicas" (tela da SUB-01).
   1.2. "Agendas Google" (tela da SUB-02).
   1.3. "Equipe" (nova tela, ver requisito 3).
   (Manter "Exames & Blocos" e "Listas" onde já estão.)
2. Categoria de profissional:
   2.1. Adicionar à tabela `professionals` o campo `category` (texto): valores "medico", "enfermagem", "recepcao", "administrativo", "financeiro", "outro".
   2.2. Manter o campo `role` existente (não remover; continua para os papéis finos medico_01 etc.).
3. Tela "Equipe" (React) no grupo Cadastros:
   3.1. Lista agrupada por categoria (seções: Médicos, Enfermagem, Recepção, Administrativo, Financeiro, Outros), padrão visual Paxter.
   3.2. CRUD completo de profissional: criar, editar, ativar/desativar, apagar.
   3.3. No formulário do profissional: nome, categoria, CRM/COREN, especialidade, e-mail, telefone, e seleção de clínica(s) vinculada(s) e agenda Google vinculada.
4. API:
   4.1. `PUT /api/professionals/:id` (NOVO) — editar.
   4.2. `DELETE /api/professionals/:id` (NOVO) — apagar (409 se houver sessões vinculadas; orientar desativar).
   4.3. Vínculo profissional<->clínica: usar `location_professionals` (já existe). Endpoints para adicionar/remover vínculo.
   4.4. Vínculo profissional<->agenda Google: campo `agendaCalendarId` (FK agenda_calendars, opcional) em `professionals` OU em `location_professionals` (escolher o que melhor expressa "este médico, nesta clínica, usa esta agenda"). Decisão default: colocar em `location_professionals` (a agenda depende do par médico+clínica — item 4.b). Justificar na construção.
5. Efeito no agendamento (item 4.b): quando uma sessão é de um profissional numa clínica, o sync de evento deve preferir a agenda vinculada ao par (profissional+clínica); senão a agenda da clínica; senão a regra atual; senão "primary". Encaixar na cadeia de prioridade existente sem quebrar o Pacote B.
6. Item 4.c (futuro multi-cidade, mesmo Gmail): o modelo deve permitir várias clínicas (endereços) apontando para agendas diferentes dentro da MESMA conta Google. Nenhuma trava de "uma clínica só". (Já garantido por SUB-01 + SUB-02; aqui só validar.)

## Casos extremos
1. Profissional sem categoria (legado) -> exibir em "Outros" até ser classificado.
2. Apagar profissional com sessões -> 409 + orientar desativar.
3. Profissional vinculado a várias clínicas com agendas diferentes -> o sync escolhe pela clínica da sessão.
4. Categoria fora da lista -> 400.

## Definição de PRONTO
1. Menu Cadastros reorganizado com Clínicas, Agendas Google e Equipe.
2. Campo `category` aplicado (push) e CRUD de profissional completo (criar/editar/apagar/ativar).
3. Vínculo profissional<->clínica<->agenda funcionando.
4. Teste: criar médico fictício + enfermeira fictícia, vincular a clínicas fictícias e agendas fictícias diferentes, agendar e ver o evento cair na agenda certa de cada um.
5. Aprovação do architect.

## Linhas vermelhas
1. Não remover o campo `role` existente nem quebrar quem o usa.
2. Não quebrar `location_professionals` existente.
3. Não quebrar a cadeia de escolha de calendário do Pacote B.

## RESUMO EM 1 LINHA
Menu Cadastros com Equipe em subcategorias e CRUD completo de profissionais, mais o vínculo profissional+clínica+agenda que faz o evento cair na agenda física certa, pronto para multi-cidade no mesmo Gmail.
