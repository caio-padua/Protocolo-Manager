---
name: Conciliação Asaas por leitura e extrato real
description: Por que o pagamento não chegava sozinho, o que o job de conciliação pode e não pode alterar, e a diferença entre cobrado, pago no gateway e recebido no extrato.
---
Webhook de produção do Asaas pode estar desligado/interrompido e sem authToken; a rota local devolve 401 sem o header igual ao cofre. Reativar é ajuste manual do dono no painel Asaas (nunca pelo código).

**Why:** pagamento real de R$ 5 ficou "pendente" no sistema até clique manual; nenhum hit de webhook chegou.

**How to apply:**
- Conciliação é por LEITURA (GET). "Pago" local só com consulta direta ao Asaas: status pago + valor igual + não removida. Concierge nunca é alterado por conciliação (finalização tem efeitos próprios).
- Job (api-worker, a cada 3 min, também no perfil restrito) só toca o livro de teste e pagamentos criados após `asaas.conciliacao.desde` (padrão 14/11/2026). Casos antigos só por ação explícita por ID (dono da plataforma).
- `netValue` da API NÃO inclui a taxa de mensageria (R$ 0,99 por cobrança com notificação); o líquido real vem de `GET /financialTransactions`. Pago no gateway ≠ recebido até existir lançamento no extrato.
- Perfil restrito `telegram-relay-dev` agora registra 2 crons (repasse + conciliação); o teste espera 2.
- `/reconciliation` antigo lê todas as empresas sem filtro (conta Asaas é única da plataforma); rotas novas são owner-only.
