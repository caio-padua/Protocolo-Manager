---
name: Webhook ZapSign órfão e vínculo cobrança×bolão por titular
description: Duas regras de integridade fixadas na auditoria de ZapSign/Asaas; o que o banco dev realmente contém.
---
1) Webhook de assinatura para envelope sem solicitação responde 200 mas fica processado=false com erro "solicitacao_nao_encontrada" (reprocessável); nunca vira "processado com sucesso".
2) Vínculo cobrança Asaas→participação de bolão exige titular comprovado: origem_tabela='payments' e payments.client_id igual ao cliente da participação; removida (deletada) ou sem titular = recusa (falha fechada).

**Why:** as 23 solicitações ZapSign "pendentes" do banco dev estão de fato não assinadas no ZapSign de produção (não é defeito); eventos em assinatura_webhook_eventos são sintéticos de teste. Cobrança da mesma clínica de outro cliente confirmava a participação errada.
**How to apply:** nova origem de cobrança só vincula a bolão se o livro financeiro registrar o titular. Webhook Asaas de produção está desabilitado/interrompido sem authToken (ajuste manual do dono no painel). Teste Lemos→RASP em tests/lemos-agenda-rasp-postgres.test.ts (Postgres descartável).
