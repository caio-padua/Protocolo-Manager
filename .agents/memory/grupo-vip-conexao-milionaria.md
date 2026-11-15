---
name: Grupo VIP e Conexão Milionária
description: Decisões do Grupo VIP (ex-Club VIP), convites, bolões com regras, cobrança só leitura e automação CAIXA pendente
---
Grupo VIP é independente da categoria comercial; adesão e entrada em bolão só pelo próprio cliente (Bearer do portal); convite é só registro, sem notificação.

**Why:** pedido do Dr. Caio em 14/11/2026: voluntariedade, isolamento entre clínicas, nunca mostrar jogo como efetivado sem comprovante oficial, nunca pagar/apostar de verdade.

**How to apply:**
- Regras e rotas em `lib/grupo-vip.ts`; tabelas criadas por `ensureGrupoVipTables` dentro de `ensureBoloesTables` (fora do Drizzle).
- Cobrança Asaas: só vincular charge já existente no livro com empresa_id igual; nunca criar nem chamar o Asaas.
- "Efetivado" = comprovante ativo; natureza (nominativo x cota oficial individual) classificada pelo gestor.
- Automação CAIXA: declarada pendente (`GET /boloes/gestao/automacao`); spec em `specs/grupo-vip-conexao-milionaria.md`.
- Portal Grupo VIP agora faz 1 leitura (`/area-paciente/grupo-vip`); não ler categoria/nível ali (e2e vigia).
