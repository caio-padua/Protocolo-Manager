# SPEC A — Histórico de Conversas Persistido no Console IA Pro

**Data:** 19/07/2026 | **Agente:** Dr. Replit Paxter | **Status:** ESPECIFICADO

---

## Objetivo
Salvar cada conversa do Console IA Pro (AbaChatPro) no banco de dados, para que ao reabrir o agente a conversa anterior seja restaurada e nenhuma mensagem seja perdida por reload de página.

---

## Requisitos obrigatórios

1. **Tabela `agent_conversations`**: `id`, `agente_id` (FK agentes), `titulo` (text, auto-gerado da 1ª mensagem), `created_at`, `updated_at`.
2. **Tabela `agent_messages`**: `id`, `conversation_id` (FK agent_conversations), `role` (text: "user"|"assistant"|"system"), `content` (text), `created_at`.
3. **API — criar/retomar conversa**: `POST /api/agentes-chat/conversations` com `{ agente_id }` → cria nova conversa, retorna `{ id, titulo, messages: [] }`.
4. **API — salvar mensagem**: `POST /api/agentes-chat/conversations/:id/messages` com `{ role, content }` → insere mensagem, retorna a mensagem salva.
5. **API — listar conversas do agente**: `GET /api/agentes-chat/conversations?agente_id=N` → lista as últimas 10 conversas do agente (id, titulo, updated_at, preview da última mensagem).
6. **API — carregar conversa**: `GET /api/agentes-chat/conversations/:id` → retorna conversa com todas as mensagens.
7. **API — encerrar conversa**: `DELETE /api/agentes-chat/conversations/:id` → soft-delete (encerrada_em timestamp).
8. **Frontend AbaChatPro**: ao selecionar agente, carregar a conversa mais recente (GET conversations?agente_id). Se houver, restaurar histórico de mensagens. Se não houver, criar nova (POST conversations).
9. **Frontend**: botão "Nova Conversa" limpa o estado e cria nova via POST.
10. **Frontend**: painel lateral esquerdo (mini-lista) com as últimas 5 conversas do agente, clicáveis para restaurar.
11. **conversation_id** deve ser exposto no contexto do painel para que AcaoTrelloCard e AcaoWppNotificar o recebam.
12. **Auto-save**: cada mensagem enviada (user ou assistant) é salva via POST imediatamente após ser adicionada ao estado.
13. **Título auto-gerado**: primeiras 50 chars da 1ª mensagem do usuário; atualizável via PATCH.

---

## Casos extremos

- Agente sem conversa prévia → criar nova silenciosamente.
- Falha de rede ao salvar mensagem → não bloquear o chat; logar erro no console.
- Conversa com muitas mensagens (>100) → carregar somente as últimas 50 na tela; scroll infinito opcional (fase futura).
- Usuário muda de agente antes de receber resposta → cancelar fetch pendente (AbortController).

---

## Definição de PRONTO

- [ ] Tabelas criadas via `db push`.
- [ ] Rotas respondem corretamente via `curl`.
- [ ] Ao recarregar a página com agente selecionado, conversa anterior reaparece.
- [ ] Botão "Nova Conversa" cria nova conversa limpa.
- [ ] Screenshot mostrando histórico restaurado.

---

## Linhas vermelhas

- NÃO alterar o motor de IA (chamada ao Anthropic) — apenas envolver com save/load.
- NÃO apagar mensagens existentes (soft-delete apenas em conversas, nunca em mensagens).
- NÃO mexer em outros routers além de `agentes-chat.ts`.
