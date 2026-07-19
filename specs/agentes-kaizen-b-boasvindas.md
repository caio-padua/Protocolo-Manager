# SPEC B — Notificação Automática de Boas-Vindas por WhatsApp

**Data:** 19/07/2026 | **Agente:** Dr. Replit Paxter | **Status:** ESPECIFICADO

---

## Objetivo
Ao cadastrar um novo cliente no sistema, o agente Aurora ADM dispara automaticamente uma mensagem de boas-vindas por WhatsApp, com o nome do cliente e os próximos passos do atendimento.

---

## Requisitos obrigatórios

1. **Hook no POST `/api/clients`**: após criação bem-sucedida do cliente, chamar (fire-and-forget, sem bloquear a resposta) a função `dispararBoasVindas(clientId)`.
2. **Função `dispararBoasVindas`**: busca o cliente (nome, telefone), verifica se WPP está configurado (`isWhatsappConfigured()`), monta e envia a mensagem.
3. **Template da mensagem de boas-vindas**:
   ```
   Olá, [NOME_CLIENTE]! 🌿
   Bem-vindo(a) ao Instituto Padua — cuidado real, resultado clínico.

   Seu cadastro foi concluído com sucesso. Em breve nossa equipe entrará em contato para agendar sua consulta de avaliação.

   Qualquer dúvida, estamos aqui!
   — Equipe PAXTER
   ```
4. **Graceful degradation**: se telefone ausente ou WPP não configurado → logar aviso, não lançar erro, não bloquear o cadastro.
5. **Toggle global**: variável `BOAS_VINDAS_WPP_ATIVO` em `app_settings` (chave/valor) — padrão `true`. Se `false`, skip o disparo.
6. **Log de auditoria**: inserir registro em `wpp_log` (tabela existente ou nova coluna em `agentes_trello_cards`) com: `client_id`, `tipo: "boas_vindas"`, `status: "enviado"|"falhou"|"sem_telefone"`, `created_at`.
7. **Frontend — toggle na aba Integrações**: switch "Boas-vindas automáticas por WPP" que lê/escreve a config via `GET/PUT /api/settings/boas_vindas_wpp`.
8. **Agente associado**: Aurora ADM (`role = "agente_adm_01"`); se não encontrada, usar o 1º agente disponível como fallback.

---

## Casos extremos

- Cliente sem telefone cadastrado → skip silencioso + log `sem_telefone`.
- WPP não configurado (sem TWILIO) → skip silencioso + log `falhou`.
- Twilio retorna erro (quota, número inválido) → capturar, logar, não derrubar o boot nem a rota.
- Toggle desativado → skip sem log.
- Mesmo cliente cadastrado 2x (re-upsert) → disparar só na criação real (verificar se `id` é novo na resposta).

---

## Definição de PRONTO

- [ ] POST `/api/clients` com telefone válido dispara WPP (curl confirma `sent: true` nos logs).
- [ ] POST `/api/clients` sem telefone → cadastro funciona, WPP skip, sem erro 500.
- [ ] Toggle na AbaIntegracoes ativa/desativa o disparo.
- [ ] Screenshot do toggle + log de auditoria.

---

## Linhas vermelhas

- NÃO bloquear o cadastro por falha no WPP (fire-and-forget obrigatório).
- NÃO inventar novo sistema de mensageria — usar `sendWhatsapp` existente em `lib/whatsapp.ts`.
- NÃO usar o número do sandbox Twilio para produção sem aviso ao CEO.
