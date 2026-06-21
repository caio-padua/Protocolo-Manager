---
name: Profissionais estratificados + Entrada 4 (Corpo Clínico)
description: Decisões de escopo da estratificação de profissionais e da porta de agendamento de não-médicos.
---

# Estratificação de profissionais + Entrada 4

Regra: a Entrada 4 do agendamento deixou de ser "Médicos Assistentes" e passou a ser
"Corpo Clínico / Profissionais" — agora inclui NÃO-MÉDICOS agendáveis (enfermeira, nutricionista,
psicólogo), não só médicos assistentes.

- **Quem é agendável na Entrada 4:** qualquer profissional `active=true` e `isPrimaryDoctor=false`
  (Dr. Caio é a Entrada 3, isolada). As 4 entradas (injetável / estético / Dr. Caio / corpo clínico)
  NUNCA se misturam — o backend valida a entrada no POST de scheduling request.
- **Taxonomia:** `professionalType` (medico vs nao_medico) → área → especialização, tudo data-driven
  (tabelas `professional_areas` / `professional_specialties`, ambas com `active`). Médico mostra
  "especialidade"; não-médico mostra "especialização". Nada hardcoded na tela.
- **Catálogo só ativo para o paciente:** `/scheduling/areas`, `/professional-areas` e
  `/professional-specialties` filtram `active=true`. `/scheduling/areas` só lista área que tem
  profissional agendável.

**Why:** decisão de produto do CEO (Dr. Caio) — recepção agenda todo o corpo clínico, não só médicos.
Catálogo inativo não pode vazar para o paciente.

**How to apply:** ao mexer no agendamento ou no cadastro de profissionais, manter as 4 entradas
separadas, manter a seleção data-driven (sem hardcode de áreas/especializações) e validar
integridade área↔especialização no PUT (especialização tem de pertencer à área) retornando 400.
