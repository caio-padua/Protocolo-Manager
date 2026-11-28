---
name: Depuração de Exames — porteiro de identidade e isolamento
description: Decisões duráveis do porteiro de identidade do laudo, quarentena e escopo por clínica nas rotas de exames.
---

Laudo só entra no prontuário se a identidade for confirmada (CPF válido igual, ou nome+nascimento compatíveis); dado ausente nunca confirma. Qualquer outro veredito = quarentena (sem resultados, Drive, cofre ou aviso). Contradição só é liberada por médico com vínculo clínico.

**Why:** laudo de homônimo ou de outra pessoa no prontuário é erro clínico; o dono exigiu "ausência nunca é positivo".

**How to apply:**
- Todo caminho que grava exam_results (portal, Drive em massa, vigia) usa o mesmo porteiro (identity-gate / verified-persist). Novo importador deve usá-lo.
- Clínica do documento = clínica do cadastro do cliente, nunca 5 fixo; cliente sem clínica = recusa/quarentena.
- /api/exames-lab/* NÃO está no bypass do basicAuth: token do portal (3 partes) não serve; cliente usa /api/area-paciente/exames/* (token do portal, clientId só do token).
- exam_identity_checks é append-only por trigger; tabelas direcao_favoravel_exame e colunas llm_pipeline/reprocessamento_* existem fora do Drizzle (banco de teste precisa criá-las).
- Fixture de teste que simula requireCollaborator precisa preencher req.collaborator (clinicalToolAccess exige) e enfileirar o catálogo de exames; nunca afrouxar a rota.
