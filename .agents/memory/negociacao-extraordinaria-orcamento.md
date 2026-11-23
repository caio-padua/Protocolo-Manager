---
name: Negociação extraordinária e cadência de 30 minutos
description: decisões de arquitetura da política comercial por clínica, motor de negociação e cadência
---
Dinheiro só em centavos inteiros (pontos-base); IA nunca calcula. Sem custo cadastrado no catálogo ou margem abaixo do mínimo = decisão humana. Cadência (minutos 0/10/20/30) nasce DESLIGADA por clínica.
**Why:** o médico exigiu trava de margem e nenhuma promessa falsa ao cliente; frases não afirmam reunião com gerente/sócio antes de aprovação humana real.
**How to apply:** trilha vai em budget_eventos + cascata_eventos (atendimento_ficha_evento exige ficha e é imutável). Migração manual idempotente em comercial-migracao.ts (reversível). Rotas manuais sem codegen (api-zod barrel quebra). Testes isolados usam banco descartável; filtrar asserções por cliente porque processarCadencia varre todas as negociações do banco.
