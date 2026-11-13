---
name: Telegram — deduplicação por update_id
description: Decisões da deduplicação de entregas do webhook do Telegram (chave, ordem gravar→repassar, 500 só em falha transitória)
---
- Chave única parcial (chat_id, update_id) em telegram_inbox_messages; linhas antigas e de saída ficam com update_id NULL (NULL não colide). Migração aditiva via SQL bruto no boot; reversão = DROP INDEX + DROP COLUMN (só perde chaves).
- Ordem: GRAVAR primeiro (INSERT ... ON CONFLICT DO NOTHING) e só então repassar ao CEO; duplicada nunca repassa nem alerta o Slack.
- Falha técnica passageira (rede, 08/40/53/57) => 500 para o Telegram reentregar; erro permanente (23/22/42) => 200. Antes de 500, o CEO é avisado "não gravada".
**Why:** o repasse antes da gravação impedia saber se a entrega era repetida; responder sempre 200 perdia mensagens quando o banco caía.
**How to apply:** nova rota que grave entrada do Telegram deve usar gravarMensagemEntrada; testes de concorrência usam banco descartável (initdb em /tmp, socket Unix), nunca o DATABASE_URL. Só o ramo "cliente vinculado" é deduplicado (vínculo /start e senha não).
