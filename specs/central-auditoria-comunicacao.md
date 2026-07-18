# SPEC — Central de Auditoria de Comunicação

## Objetivo
Página unificada `/comunicacao/central-auditoria` com um bloco por canal,
mostrando tudo que foi enviado (o quê, quando, para quem, status, conteúdo
completo ao clicar). TDAH/TOC-friendly: blocos visuais distintos, cores de
status, filtros rápidos.

## Canais

### Bloco 1 — WhatsApp (Twilio)
- Fonte: GET /api/whatsapp/messages (DB whatsapp_mensagens_log, já existe)
- GET /api/whatsapp/stats (já existe)
- Colunas: status LED, hora, destinatário mascarado, contexto, preview corpo
- Click expande: corpo completo + SID + histórico de status + error_code
- Filtros: status (queued/sent/delivered/read/failed), contexto, data

### Bloco 2 — E-mail (Gmail)
- Fonte: GET /api/email/status (conexão) + GET /api/email/log (a criar)
- Criar endpoint /api/email/log que consulta DB tabela email_log (a criar)
- Schema: email_log(id, clienteId, para, assunto, tipo, status, criadoEm)
- A rota de envio de e-mail já existe — basta logar antes de responder
- Colunas: status, hora, destinatário, assunto, tipo
- Click expande: corpo HTML + anexos

### Bloco 3 — Telegram
- Fonte: GET /api/settings/telegram (config) + GET /api/telegram/log (a criar)
- Criar tabela telegram_log similar ao whatsapp_log
- Por ora: mostra config status e mensagem "aguardando configuração do token"
- Click expande: corpo + chat_id mascarado

### Bloco 4 — Trello
- Por enquanto: bloco de status mostrando "não configurado"
- Quando configurado: lista cards criados/movidos via POST /api/trello/log

## UI
- 4 cards maiores em grid 2x2 (desktop) / coluna (mobile)
- Cada card: header colorido (cor do canal), contagem total + taxa de entrega,
  tabela de logs com scroll, botão "Expandir tudo"
- Painel de detalhe desliza da direita ao clicar em uma linha
- Filtro global: data (hoje/7d/30d/custom), canal, status
- Auto-refresh a cada 30s com timestamp da última atualização

## Rota
- Rota frontend: /comunicacao/central-auditoria
- Menu: "Central de Auditoria" no grupo Comunicação, ícone ShieldCheck

## Aceite
- WhatsApp funcional (dados reais do DB)
- Email mostra status de conexão + log quando configurado
- Telegram e Trello mostram estado de configuração honesto
- Nenhum dado sensível (telefone/email completo) exposto sem mascaramento
