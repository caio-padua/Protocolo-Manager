---
name: Conversa unificada WWP+TG e backup de mensagens
description: Como a leitura unificada e o backup por clínica foram desenhados e o que ficou pendente
---
Leitura única via UNION SQL (log do WhatsApp + inbox do Telegram); clínica = empresa_id do log ou do cliente; sem cliente = fora da visão da clínica.
Linhas via='telegram' do log WWP duplicam a inbox: descartadas na leitura (mesmo cliente+texto <120s).
**Why:** colunas empresa_id/direcao do log estão fora do schema Drizzle (drift) — usar SQL cru.
**How to apply:** nova rota de comunicação lê por lib/comunicacao-unificada; backup guarda os 3 formatos em bytea com SHA-256.
Pendente: perfil "auditor" não existe (backup = admin + dono); /whatsapp/messages e /stats antigas sem autenticação; aba Telegram do Cockpit ainda sem bolhas; tarifas só leitura na central (edição em Licenciado).
