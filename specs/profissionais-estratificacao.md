# Spec 1 — Estratificação de Profissionais (cadastro)

## Objetivo
Estratificar os profissionais por TIPO (médico / não-médico), ÁREA PROFISSIONAL e ESPECIALIZAÇÃO, com número de registro do conselho e liga/desliga (ativo/inativo), tudo editável pelo CEO no cadastro, sem programador.

## Contexto atual (verificado)
- Tabela `professionals` tem: name, crm, specialty (texto livre), email, phone, unit, serviceTypes, category, role, isPrimaryDoctor, active, login/hash.
- Cadastro front (`artifacts/padcom/src/pages/professionals/index.tsx`) só CRIA; campos: Nome, CRM/COREN, Especialidade (texto), Telefone, E-mail, Unidade. Sem editar, sem toggle ativo.
- Backend `routes/professionals.ts`: GET/POST/PUT/DELETE existem; PUT já aceita `active`. Mas o contrato OpenAPI (`lib/api-spec/openapi.yaml`) só declara listProfessionals + createProfessional — não há hook gerado de update.

## Requisitos exatos
1. Criar tabela catálogo `professional_areas` (área profissional): id, professionalType ('medico'|'nao_medico'), name, slug (único), defaultPaymentArm (texto, default 'sinal25'), active (default true), sortOrder, createdAt.
2. Criar tabela catálogo `professional_specialties` (especialização): id, areaId (FK lógica → professional_areas), name, slug, active (default true), sortOrder, createdAt; único por (areaId, name).
3. Adicionar à tabela `professionals` os campos: professionalType (texto, default 'medico'), areaId (int, nullable), specialtyId (int, nullable), registrationCouncil (texto: CRM/COREN/CRP/CRN), registrationNumber (texto). Campos antigos crm/specialty permanecem (compatibilidade/display).
4. Migração sem perda: colunas novas entram nullable/ com default; nenhuma linha existente é apagada (linha vermelha: nunca truncar professionals).
5. Endpoints de leitura do catálogo para alimentar os selects do cadastro: GET /professional-areas (lista áreas ativas com seu tipo) e GET /professional-specialties?areaId=N (especialidades ativas da área). Ambos no contrato OpenAPI + hooks gerados.
6. Endpoint de atualização no contrato: PUT /professionals/{id} declarado no OpenAPI com os campos novos, gerando hook useUpdateProfessional. (O handler PUT já existe; estender para gravar professionalType, areaId, specialtyId, registrationCouncil, registrationNumber.)
7. createProfessional (POST) e Professional (schema de saída) no OpenAPI passam a incluir os campos novos; codegen regenerado.
8. Cadastro front (mesma página, design Paxter 3D):
   8.1. Seletor TIPO: "Médico" / "Não-médico" (controle de seleção 1-entre-N, Padrão 4.2).
   8.2. Select ÁREA PROFISSIONAL — opções vêm de GET /professional-areas filtradas pelo tipo escolhido.
   8.3. Select ESPECIALIZAÇÃO — opções vêm de GET /professional-specialties?areaId=, habilitado só após escolher a área.
   8.4. Campo CONSELHO (CRM/COREN/CRP/CRN) + campo NÚMERO DE REGISTRO.
   8.5. Toggle ATIVO/INATIVO em sulco concavo (ToggleWell, Padrão 5).
   8.6. Botão EDITAR em cada card que reabre o mesmo diálogo preenchido e salva via PUT.
9. Card do profissional mostra, em slots de posição fixa (Padrão 12, sem flex-wrap nos dados-chave): nome, badge de TIPO, ÁREA, ESPECIALIZAÇÃO, registro (conselho+número) e selo ATIVO/INATIVO. Campo vazio mostra "—", nunca some.
10. Validação visual por runtime + screenshots (typecheck global está pré-quebrado por codegen; não usar tsc como prova).

## Casos extremos
- Profissional sem área/especialidade (legado): card mostra "—" nos slots; não quebra.
- Área inativa não aparece no select do cadastro nem no paciente.
- Tipo "médico" só lista áreas professionalType='medico'; "não-médico" só as 'nao_medico'.
- Trocar o tipo limpa área e especialidade selecionadas (evita par inconsistente).
- PUT que tenta gravar areaId/specialtyId inexistente → 400 (id inválido), nunca grava lixo.

## Definição de PRONTO
- Tabelas catálogo criadas; colunas novas em professionals; nenhuma linha perdida.
- GET /professional-areas, GET /professional-specialties, PUT /professionals/{id} no contrato + hooks gerados + validados por curl.
- Cadastro cria E edita com tipo/área/especialidade/registro/ativo; selects data-driven; screenshots provando.
- Card estratificado com slots fixos e selo ativo/inativo; screenshot provando.

## Linhas vermelhas
- Nunca truncar/recriar `professionals` nem apagar linhas.
- Não tocar motor de injetáveis/RAS FAP nem motor de agenda (apenas adicionar dados/recursos).
- Densidade B na resposta ao CEO + "RESUMO EM 1 LINHA".
- Design: manter painéis 3D; cantos quadrados; toggle quadrado; nada de pílula arredondada.
