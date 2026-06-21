# Spec 2 — Seleção do paciente estratificada (Entrada 4) + agenda + braços de pagamento

## Objetivo
Na entrada do paciente para o corpo clínico (Entrada 4), o cliente escolhe ÁREA PROFISSIONAL → ESPECIALIZAÇÃO → PROFISSIONAL → horário, sem ver tudo misturado, e cada solicitação fica ligada ao braço de pagamento da área.

## Contexto atual (verificado)
- Entrada 4 hoje = "Médicos Assistentes": `GET /scheduling/doctors` (só category='medico', não-primário, ativo) → escolhe médico → `GET /agenda/slots?resourceId=&date=` → `POST /scheduling/requests` entrada="assistente".
- POST entrada="assistente" valida no servidor: profissional ativo, category='medico', não-primário, com recurso de agenda ativo, e o horário precisa estar livre no motor. paymentArm default "sinal25".
- Motor de agenda (computeResourceSlots, agenda_resources, agenda_windows) é linha vermelha: não alterar a lógica, apenas consumir.

## Requisitos exatos
1. Novo endpoint GET /scheduling/areas: retorna apenas ÁREAS ativas que tenham ao menos um profissional "agendável" (ativo, não-primário, com recurso de agenda ativo). Cada área traz: id, name, professionalType, e a lista de ESPECIALIZAÇÕES (ativas) que também tenham profissional agendável. (Áreas/especialidades sem ninguém agendável não aparecem.)
2. Novo endpoint GET /scheduling/professionals?areaId=&specialtyId=: retorna profissionais agendáveis daquela área/especialização, cada um com id, name, professionalType, areaName, specialtyName, registrationCouncil, registrationNumber e resourceId (primeiro recurso ativo do profissional). Filtros opcionais; sem filtro retorna todos os agendáveis.
3. POST /scheduling/requests entrada="assistente" passa a aceitar QUALQUER profissional agendável (ativo, NÃO-primário, com recurso de agenda ativo) — remover a exigência rígida category='medico' (não-médicos também podem ser agendados). Mantidas: validação de não-primário, recurso ativo e horário realmente livre no motor.
4. Braço de pagamento por área: ao criar a solicitação, se a área do profissional tiver defaultPaymentArm, usar esse valor como paymentArm (fallback "sinal25"). Sem cobrança real (apenas o campo).
5. Front Entrada 4 (`agendar.tsx`, fluxo "assistente"), design Paxter 3D, mantendo as 4 entradas separadas:
   5.1. Passo 1: escolher ÁREA PROFISSIONAL (cards/seleção 1-entre-N).
   5.2. Passo 2: escolher ESPECIALIZAÇÃO da área.
   5.3. Passo 3: escolher PROFISSIONAL (lista filtrada por área+especialização; mostra tipo, especialização e registro).
   5.4. Passo 4: escolher data e horário (slots do motor pelo resourceId) e confirmar — igual ao fluxo atual.
   5.5. O rótulo da Entrada 4 deixa de ser exclusivo de "médicos": passa a "Corpo Clínico / Profissionais" (consulta com nossos profissionais), sem misturar com as demais entradas.
6. Validação por runtime (curl nos 2 endpoints) + screenshots do fluxo de 4 passos.

## Casos extremos
- Área sem profissional agendável → não listada (passo 1).
- Especialização sem profissional agendável → não listada (passo 2).
- Profissional sem recurso de agenda → não aparece em /scheduling/professionals.
- Horário tomado entre a escolha e o envio → 409 "Horário não está mais disponível" (comportamento atual mantido).
- Voltar um passo limpa as escolhas seguintes (não enviar par inconsistente).

## Definição de PRONTO
- GET /scheduling/areas e GET /scheduling/professionals no contrato OpenAPI + hooks + validados por curl.
- POST entrada="assistente" aceita não-médico agendável; rejeita primário/sem-agenda/horário-ocupado.
- Front com os 4 passos (área→especialização→profissional→horário); screenshots provando troca de agenda por profissional.
- paymentArm gravado a partir da área; sem provider de cobrança.

## Linhas vermelhas
- NUNCA misturar as 4 entradas (injetáveis, estéticos, Dr. Caio, corpo clínico).
- NUNCA alterar a lógica do motor de agenda (computeResourceSlots/janelas) — só consumir.
- SEM cobrança real.
- Densidade B + "RESUMO EM 1 LINHA".
