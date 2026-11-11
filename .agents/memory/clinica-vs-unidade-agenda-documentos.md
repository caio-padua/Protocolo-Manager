---
name: Clínica (empresa) x unidade/agenda nos documentos; procedimentos gerados das substâncias
description: protocols.unit é local da agenda, não a clínica; identidade nos documentos vem de empresas.nome; lançador escolhe procedimentos
---
- `protocols.unit` / `sessions.unit` = local operacional (nome de agenda). A clínica dos documentos (RASP, PDF, Carta) é `empresas.nome` da empresa do cliente.
**Why:** o cliente tem `location_id` = "AGENDA GERAL"; comparar unit com `locations.name` do cliente recusava todo protocolo novo (409 "unidade não corresponde").
**How to apply:** documentos usam `lib/clinic-unit.ts` (comNomeDaClinica + unidadePertenceAClinica: vazio, nome da clínica ou local da MESMA empresa). Não mexer em `resolveClinicalMember` global (testes com fila de linhas simuladas).
- Lançador de protocolo escolhe PROCEDIMENTOS (decisão do CEO); o payload continua por `substanceId`, então agenda/RASP seguem `doctor_participation` (implante = médico+enfermagem).
- 217 procedimentos gerados das substâncias (nome limpo + dose, ex.: "COENZIMA Q10 100MG"); rota owner-only `POST /procedimentos/gerar-de-substancias`, idempotente. Nome com dose é exceção explícita do CEO à regra "nome limpo".
- Testes de rota que mockam `resolveClinicalMember` precisam mockar também `clinic-unit` ou ter linha em `empresas`; fixtures postgres isolados precisam da tabela `empresas`.
- Migração `20261114_unidade_clinica_religacao.sql` aplicada só no desenvolvimento; produção NÃO foi tocada (nunca publicar sem ordem).
