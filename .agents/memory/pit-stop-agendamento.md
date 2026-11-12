---
name: Pit Stop — plano de agendamento compartilhado
description: Decisões e armadilhas do Pit Stop (Caminho B de agendamento) e onde está a referência permanente
---
Referência permanente: `docs/REFERENCIA-AGENDA-PROFISSIONAL-LOCAL.md` (glossário, vínculos, regras, dúvidas, proibições).
**Why:** o CEO exigiu que empresa/local/profissional/agenda nunca sejam inferidos uns dos outros e que ordem de exibição jamais desempate agendas.
**How to apply:** ambiguidade de agenda = "escolha pendente"; plano e Caminho A são exclusivos por protocolo; "sincronizado" só com TODAS as visitas confirmadas no Google.
- Testes antigos que fixavam o desempate por sort_order foram reescritos de propósito; não restaurar.
- Suíte `protocol-google-sync-postgres` já falhava (21 testes, empresas.nome ausente no banco montado à mão) ANTES do Pit Stop; confirmado em baseline.
- `LancadorInline` usava `getCollabToken` sem importar (quebrava o lançador); corrigido.
- Teste de banco isolado do Pit Stop precisa de tabela `substance_applications` e colunas completas de `location_professionals` (consultas drizzle selecionam tudo).
