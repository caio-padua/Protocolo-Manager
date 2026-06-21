# Spec 3 — Dados de teste da equipe (taxonomia + profissionais + agendas)

## Objetivo
Semear taxonomia completa (áreas + especializações) e profissionais com agendas para o CEO testar todas as telas, sem campos vazios, substituindo os fictícios provisórios.

## Requisitos exatos
1. ÁREAS profissionais (professional_areas), todas ativas, defaultPaymentArm='sinal25':
   - Medicina (professionalType='medico')
   - Enfermagem (professionalType='nao_medico')
   - Psicologia (professionalType='nao_medico')
   - Nutrição (professionalType='nao_medico')
2. ESPECIALIZAÇÕES (professional_specialties) por área (todas ativas):
   - Medicina: Integrativa, Cardiologia, Endocrinologia, Clínica Médica, Dermatologia
   - Enfermagem: Integrativa, Estética, Domiciliar
   - Psicologia: Psicossomática, Clínica, Comportamental
   - Nutrição: Esportiva, Clínica, Funcional
3. MÉDICOS (professionalType='medico', isPrimaryDoctor=false) — substituir os provisórios Dr. Bruno (id 7) e Dra. Helena (id 8), preservando suas agendas/recursos e janelas:
   - id 7 → Dr. Kleber Lemos — área Medicina, especialização Integrativa, conselho CRM, número fictício.
   - id 8 → Dra. Fernanda Manzieri — área Medicina, especialização Cardiologia, conselho CRM, número fictício.
4. NÃO-MÉDICOS (professionalType='nao_medico', isPrimaryDoctor=false) — criar 3 novos, cada um com agenda PRESENCIAL (endereço próprio fictício) + ON-LINE, janelas (seg-sex 08-12 e 14-20, sáb 08-12), ativos:
   - Enf. (Enfermagem / Integrativa) — nome fictício, conselho COREN.
   - Psic. (Psicologia / Psicossomática) — nome fictício, conselho CRP.
   - Nutr. (Nutrição / Esportiva) — nome fictício, conselho CRN.
5. Dr. Caio (id 6, primário): professionalType='medico', área Medicina, especialização Endocrinologia, conselho CRM + número; manter suas 4 agendas (SP, DF, PB, online).
6. Legado interno (Ana id 1, Carlos id 2, Fernanda id 3): preencher professionalType='nao_medico', área Enfermagem + uma especialização e registro fictício (sem agenda → não aparecem ao paciente). Sem campos vazios.
7. Todo profissional novo/atualizado: registrationCouncil + registrationNumber preenchidos; crm preenchido para compatibilidade de exibição. Sem campos vazios não preenchidos.

## Casos extremos
- Idempotência: re-rodar não duplica área/especialização (chave por slug / (areaId,name)) nem recria agenda já existente.
- Substituir Bruno/Helena = UPDATE (mantém ids e agendas), nunca apagar+recriar.

## Definição de PRONTO
- 4 áreas + todas as especializações no banco; sem duplicatas.
- Médicos = Kleber e Fernanda com área/especialização/registro; agendas preservadas.
- 3 não-médicos com agenda presencial+online e janelas; aparecem em /scheduling/professionals por área.
- Dr. Caio e legado com tipo/área/especialização/registro preenchidos; nenhum campo vazio.
- GET /scheduling/areas mostra Medicina, Enfermagem, Psicologia, Nutrição (com profissionais agendáveis).

## Linhas vermelhas
- Nunca apagar linhas de professionals; substituição é UPDATE.
- Dados fictícios permitidos onde o CEO não forneceu (autorizado).
- Densidade B + "RESUMO EM 1 LINHA".
