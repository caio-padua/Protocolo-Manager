---
name: Receituário Automático
description: Tabelas, rotas e decisões de arquitetura do módulo de agendamento automático de fórmulas magistrais.
---

# Receituário Automático

## Tabelas
- `receitas_agendadas` — agenda por cliente (frequência, canais, dias de antecedência)
- `receitas_agendadas_slots` — cada receita na linha do tempo (data_liberacao TEXT YYYY-MM-DD, formulas JSONB, status)

**Por que SQL direto?** — `pnpm --filter @workspace/db run push` queria dropar 25 colunas `empresa_id` de tabelas com dados. Criação sempre por `executeSql` direto.

## Rotas (`artifacts/api-server/src/routes/receituario.ts`)
- `GET/POST /api/receituario/agendas` — CRUD de agendas (filter `?clientId=N`)
- `GET/PUT/DELETE /api/receituario/agendas/:id` — detalhe, edição, soft-delete (ativo=false)
- `POST/GET /api/receituario/agendas/:id/slots` — criar e listar slots
- `PUT/DELETE /api/receituario/slots/:id` — editar e remover slot
- `POST /api/receituario/slots/:id/liberar` — liberação manual (idempotente: ENTREGUE não repete)
- `POST /api/receituario/processar` — worker diário (libera AGUARDANDO com data <= hoje)
- `GET /api/receituario/alertas?dias=N` — slots próximos (Cockpit)

## Worker
Chame `POST /api/receituario/processar` via cron às 06:00 BRT (ainda sem cron-job; manual ou via trigger externo).

## Frontend
- Tela: `artifacts/padcom/src/pages/receituario-automatico/index.tsx`
- Rota wouter: `/receituario-automatico`
- Menu: Arsenal Clínico → "Receituário Automático" (ícone Calendar — já importado no Layout)
- Cockpit: `ReceituarioAlertaPanel` embutido em accordion "receituario" do `cockpit/index.tsx`

## Onda 2 (pendente)
- Gerar PDF assinado ICP-Brasil na liberação
- Upload automático no Drive (pasta PROTOCOLOS do cliente)
- Envio por email, WhatsApp e Telegram
- Cron-job interno às 06:00 BRT

**Why:** separado do gerador de PDF do RAS — receituário tem layout e assinatura próprios; integração multicanal vem na próxima onda.
