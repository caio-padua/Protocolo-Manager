# SPEC D — Quick-Replies por Agente no Console IA Pro

**Data:** 19/07/2026 | **Agente:** Dr. Replit Paxter | **Status:** ESPECIFICADO

---

## Objetivo
Adicionar até 6 botões de resposta rápida configuráveis por agente no Console IA Pro. Ao clicar, o texto é enviado como mensagem do usuário. O administrador configura os textos no painel de settings do agente.

---

## Requisitos obrigatórios

1. **Tabela `agent_quick_replies`**: `id`, `agente_id` (FK agentes), `texto` (text, max 120 chars), `ordem` (int 1-6), `ativo` (boolean default true), `created_at`.
2. **API CRUD**:
   - `GET /api/agentes/:id/quick-replies` → lista as quick-replies do agente ordenadas por `ordem`.
   - `POST /api/agentes/:id/quick-replies` com `{ texto, ordem }` → cria.
   - `PUT /api/agentes/:id/quick-replies/:qid` com `{ texto, ordem, ativo }` → atualiza.
   - `DELETE /api/agentes/:id/quick-replies/:qid` → deleta.
3. **Frontend AbaChatPro — barra de quick-replies**: linha horizontal de chips/botões acima da caixa de texto, carregados ao selecionar o agente. Máximo 6, só os `ativo = true` são exibidos.
4. **Interação**: clicar num chip → preenche o campo de texto com o texto do chip + foca o campo (usuário pode editar antes de enviar) OU envia diretamente (sem escala — colocar como opção default: preenche o campo, não envia automaticamente).
5. **Comportamento vazio**: se o agente não tiver quick-replies, a barra não é renderizada (sem espaço vazio).
6. **Frontend AbaChatPro — painel de configuração de quick-replies**: dentro do painel de settings (painel direito), nova seção "Respostas Rápidas" com:
   - Lista dos chips existentes com botão de editar (inline) e deletar.
   - Botão "+ Adicionar" que abre campo inline para digitar novo texto.
   - Limite de 6 chips por agente (botão "+ Adicionar" some ao atingir 6).
7. **Seed de exemplo**: 3 quick-replies padrão para o agente Aurora ADM (id 1 ou role=agente_adm_01):
   - "Confirmar agendamento da consulta"
   - "Enviar protocolo para assinatura"
   - "Encerrar atendimento e registrar resumo"

---

## Casos extremos

- Agente sem quick-replies → barra oculta, sem erro.
- Texto > 120 chars → truncar na API com validação Zod.
- Ordem duplicada → API reordena automaticamente (reindexar 1-N).
- Mais de 6 quick-replies na DB (inconsistência) → exibir só as primeiras 6 por ordem.

---

## Definição de PRONTO

- [ ] CRUD das quick-replies funciona via curl.
- [ ] Aurora ADM tem 3 quick-replies via seed.
- [ ] Barra de chips aparece no Console IA Pro ao selecionar Aurora ADM.
- [ ] Clicar num chip preenche o campo de texto.
- [ ] Painel de settings mostra a lista e permite adicionar/editar/deletar.
- [ ] Screenshot da barra de chips + painel de configuração.

---

## Linhas vermelhas

- NÃO enviar a mensagem automaticamente ao clicar (apenas preencher o campo).
- NÃO mostrar a barra se não houver quick-replies (zero espaço em branco).
- NÃO alterar a lógica de envio de mensagens ao Anthropic.
