# Spec Onda D — Trello Interno Automático

## Objetivo
Agentes Virtuais criam e leem cards no Trello interno da clínica automaticamente, ao fim de conversas e ao detectar alertas.

## Gatilhos de criação de card

| Gatilho | Agente responsável | Lista destino | Prioridade |
|---|---|---|---|
| Conversa encerrada no Console IA Pro (botão manual) | Agente da conversa | Lista configurada no agente | Normal |
| Alerta amarelo na avaliação de enfermagem | enf_01 | "Alertas / Atenção" | Alta |
| Alerta vermelho | enf_01 + med_02 | "Alertas / Urgente" | Urgente |
| Fim de protocolo (última sessão) | adm_01 | "Encerramento / Protocolo" | Normal |

## Configurações por agente (campos em capacidades_agente)

- `trello_interno_ativo` boolean — liga/desliga criação de cards para este agente
- `trello_list_id_default` text — ID da lista padrão no Trello
- `wpp_proativo_ativo` boolean — WhatsApp ao fim de conversa
- `email_proativo_ativo` boolean — email ao fim de conversa

## Rotas novas

```
POST /api/agentes-trello/card             — cria card a partir de conversa
GET  /api/agentes-trello/listas           — lista listas do board interno
GET  /api/agentes-trello/status           — verifica se Trello está configurado
POST /api/agentes-trello/config           — salva config por agente
GET  /api/agentes-trello/config/:id       — lê config do agente
POST /api/agentes-trello/webhook          — recebe webhook do Trello (público)
```

## Card criado

Formato do card interno:
```
Título: [EMOJI] AGENTE — Resumo da conversa (60 chars)
Descrição:
  👤 Cliente: [nome]
  📋 Assunto: [primeiras 3 mensagens]
  🤖 Agente: [nome]
  🕒 Data: [timestamp BRT]
  💬 Mensagens: [N]
  🔗 Conversa: /agentes#chat-pro/conv/[id]
```

## Webhook bidirecional

Quando o Trello recebe comentário em card que o agente criou:
1. Webhook chega em `POST /api/agentes-trello/webhook`
2. Sistema identifica qual agente criou o card (por tag no campo `desc`)
3. Agente gera resposta via Claude
4. Resposta postada como comentário no card

## Toggle

Cada agente tem toggle individual em AbaCapacidades e em AbaIntegracoes.
Quando desligado: botão "Criar Card" fica visível mas mostra aviso "Trello não ativo para este agente".

## Status sem tokens

Se TRELLO_API_KEY não está configurado:
- Todos os endpoints retornam `{ configurado: false, mensagem: "Configure TRELLO_API_KEY, TRELLO_TOKEN e TRELLO_BOARD_ID nos secrets" }`
- UI mostra banner de configuração pendente com o passo a passo
