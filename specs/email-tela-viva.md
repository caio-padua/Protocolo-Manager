# Spec A — Tela de E-mail Viva

## Objetivo
Transformar a tela `/comunicacao/emails` de um painel estático (só status + botão) em um painel operacional completo: endereço de envio visível, histórico de e-mails enviados, KPIs e filtros.

## Requisitos

### R1 — From-address visível
- `GET /api/email/status` deve retornar também `{ configured, fromAddress }` onde `fromAddress` é o e-mail da conta Google conectada (via `getGmailAddress()`).
- A tela deve exibir o endereço em destaque (ex.: `contato@clinica.com.br`), com badge "Gmail OAuth".

### R2 — Tabela de log de e-mails (`email_log`)
- Nova tabela no DB: `email_log` com colunas:
  - `id` serial PK
  - `tipo` text — `pre_sessao | pos_sessao | lembrete_semanal | ics_reenviado`
  - `cliente_nome` text
  - `destinatario` text (e-mail mascarado: primeiros 3 chars + `***@domínio`)
  - `assunto` text
  - `status` text — `enviado | falhou`
  - `erro` text nullable
  - `session_id` integer nullable FK → sessions
  - `created_at` timestamp default now
- Toda rota de envio (`send-pre-session`, `send-post-session`, `send-weekly-reminders`, `resend-ics`) deve inserir 1 linha nesta tabela ao final (sucesso ou falha).

### R3 — Rota de log
- `GET /api/email/log?limit=50&tipo=X&status=Y` retorna as últimas N entradas do `email_log`, ordenadas por `created_at DESC`.
- Filtros opcionais: `tipo` e `status`.

### R4 — KPIs na tela
- 4 cards numéricos no topo do bloco de log:
  - Total enviados (tudo)
  - Enviados (status=enviado)
  - Falhas (status=falhou)
  - Hoje (created_at = hoje)

### R5 — Filtros de período e tipo
- Botões: Hoje / 7 dias / 30 dias / Tudo
- Dropdown de tipo: Todos / Pré-sessão / Pós-sessão / Lembrete / ICS

### R6 — Painel lateral de detalhe
- Clique em qualquer linha → abre painel lateral com assunto completo, destinatário desmascarado (não — manter mascarado), tipo, status, erro (se houver), session_id com link.

## Campos novos sugeridos (para futuro - só documentar, não implementar)
- `provider` (gmail | zoho | smtp) — para Spec B
- `message_id` (ID retornado pelo Gmail API) — para rastrear bounces
- `opened_at` / `clicked_at` — para tracking de abertura (requer pixel ou serviço externo)

## Casos extremos
- Gmail desconectado: tela mostra "Sem endereço configurado" em vez de erro.
- Log vazio: tabela mostra estado vazio com ícone de caixa postal.
- Envio falhou mas log deve ser gravado mesmo assim (catch insere com status=falhou).

## Linhas vermelhas
- NÃO alterar lógica de envio dos e-mails — só acrescentar o log no final.
- NÃO expor e-mail completo do destinatário na resposta da API.
- NÃO quebrar as rotas existentes (retorno deve ser backward-compatible).

## Definição de PRONTO
- `GET /api/email/status` retorna `fromAddress`.
- Tabela `email_log` existe no DB.
- Log gravado ao enviar (testar com send-weekly-reminders ou send-pre-session).
- Tela mostra from-address, KPIs e tabela com filtros.
- Screenshot confirma tela funcionando com dados reais ou vazia mas estruturada.
