---
name: Unicidade em substance_applications
description: Por que a chave única da tabela de aplicações inclui session_number
---

Regra: a duplicata proibida em `substance_applications` é o trio (session_id, substance_id, session_number), NUNCA só o par sessão+substância.

**Why:** a consolidação semanal do fechamento de protocolo cria UMA sessão por semana e insere uma linha de aplicação POR OCORRÊNCIA agendada. Com `intervalDays < 7`, a mesma substância aparece legitimamente várias vezes na mesma sessão (sessionNumber distinto). Um índice único de 2 colunas quebra esse fluxo válido — foi rejeitado em review.

**How to apply:** qualquer contagem/constraint/dedup nessa tabela deve distinguir por session_number; contagem de "sessões feitas" deve contar sessões DISTINTAS, não linhas. O índice único é garantido por boot migration idempotente (padrão ensure-* antes do listen), que também deduplica trios exatos mantendo o menor id.
