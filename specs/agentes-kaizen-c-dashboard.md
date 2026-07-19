# SPEC C — Dashboard de Integrações ao Vivo

**Data:** 19/07/2026 | **Agente:** Dr. Replit Paxter | **Status:** ESPECIFICADO

---

## Objetivo
Exibir dentro da aba Integrações um painel de métricas em tempo real: quantos cards Trello foram criados, quantas mensagens WPP foram enviadas, e as últimas atividades de integração.

---

## Requisitos obrigatórios

1. **Tabela `agent_integration_log`**: `id`, `tipo` (text: "trello_card"|"wpp_notificacao"|"wpp_boasvindas"|"webhook_recebido"), `agente_id` (nullable), `client_id` (nullable), `status` (text: "ok"|"falhou"|"skip"), `detalhe` (jsonb, ex.: `{url, card_id}` ou `{sid}`), `created_at`.
2. **API `GET /api/agentes-integracoes/dashboard`**: retorna:
   ```json
   {
     "trello": { "total_cards": N, "hoje": N, "ultima_atividade": "ISO8601" },
     "wpp": { "total_enviadas": N, "hoje": N, "ultima_atividade": "ISO8601" },
     "log_recente": [ { "id", "tipo", "status", "detalhe", "created_at", "agente_nome" } ] // últimos 20
   }
   ```
3. **Rotas existentes que devem inserir log**: `POST /agentes-trello/card` (já existe) → inserir em `agent_integration_log` após criar o card. `POST /agentes-wpp/notificar` → inserir log. Função `dispararBoasVindas` (Spec B) → inserir log.
4. **Frontend — seção "Painel ao Vivo"** dentro de `AbaIntegracoes`: 4 KPI cards (Total Cards Trello / Cards Hoje / Total WPP / WPP Hoje) no topo.
5. **Tabela de últimas atividades**: colunas Tipo | Agente | Status | Detalhes | Quando — últimas 20 linhas, ordenadas por created_at DESC.
6. **Auto-refresh**: a cada 30 segundos, refazer o GET silenciosamente (sem mostrar spinner, apenas atualizar dados).
7. **Indicador "ao vivo"**: ponto verde pulsante ao lado do título "Painel ao Vivo" indicando que está atualizando.
8. **Ícone de status por tipo**: Trello=Layers (azul), WPP=Smartphone (verde), webhook=Webhook (cinza).
9. **Badge de status**: "OK" em verde, "FALHOU" em vermelho, "SKIP" em âmbar.

---

## Casos extremos

- Sem nenhum log → exibir zeros nos KPIs e mensagem "Nenhuma atividade registrada ainda."
- Falha no GET do dashboard → manter dados anteriores na tela, mostrar ícone de aviso.
- Log com `agente_id` nulo → exibir "—" na coluna Agente.

---

## Definição de PRONTO

- [ ] GET `/api/agentes-integracoes/dashboard` retorna JSON correto.
- [ ] Após um POST `/agentes-trello/card` ou `/agentes-wpp/notificar`, o log aparece na tabela.
- [ ] Auto-refresh funciona (observar contador mudar em 30s).
- [ ] Screenshot do painel com dados reais.

---

## Linhas vermelhas

- NÃO duplicar a tabela de log — usar `agent_integration_log` em todos os pontos.
- NÃO fazer polling mais agressivo que 30s (custo de banco).
- NÃO exibir dados de outros clientes sem filtro.
