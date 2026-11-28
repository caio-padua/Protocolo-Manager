---
name: Regras de identidade do laudo por clínica
description: Decisões e armadilhas da matriz de regras de identidade (variante de nome com CPF, preliminar, auditoria, métricas) da Depuração de Exames
---
CPF igual e válido é a âncora: variante de grafia do nome entra com apelido e trilha; nunca existe nota de semelhança que substitua o CPF.
Sem CPF comparável só nome exato + nascimento igual entra; variante vira "preliminar" (quarentena + prévia, zero exam_results).

**Why:** o CEO pediu menos bloqueio falso e menos trabalho da equipe sem abrir mão de segurança (16/11/2026).

**How to apply:**
- Limites globais ficam no código (identity-rules.ts) e a clínica só ajusta dentro deles; valor fora do teto = 400, nunca ajuste silencioso.
- exam_identity_checks e exam_identity_rule_sets são append-only por trigger: dado que precisa nascer junto (ex.: status anterior da auditoria) entra no INSERT, não em UPDATE posterior.
- Partículas (de, da, do) são removidas antes de comparar: "Dayana Sousa Ferreira" é IGUAL a "Dayana de Sousa Ferreira", sem apelido.
- Vínculo incorreto muda só o status para identidade_rejeitada; todo leitor direto de exam_results precisa filtrar esse status (evolução e prontuário já filtram).
- Config de regras ilegível => modo mais rígido, nunca o padrão frouxo.
- Texto do PDF só alimenta o detector de dois CPFs quando o importador tem texto; leitura por visão registra "não avaliado".
