# Spec Onda E — Trello Externo (Board do Cliente) + Webhook Bidirecional

## Objetivo
Cada cliente tem um board Trello pessoal onde vê seu protocolo em andamento.
O cliente pode comentar em cards e o agente responde automaticamente.

## Board do cliente — estrutura de listas

| Lista | Conteúdo | Criado por |
|---|---|---|
| Meu Protocolo | Cards com substâncias e progresso | Sistema ao criar protocolo |
| Próximas Sessões | Cards por sessão (data, local, preparo) | Sistema ao validar sessões |
| Meus Resultados | Links de exames e laudos | Sistema ao fazer upload no Drive |
| Perguntas & Respostas | Conversas com o agente | Cliente cria, agente responde |
| Conquistas | Marcos (50%, última sessão, etc.) | Sistema automático |

## Campo novo em clients

`trello_board_ext_id` text — ID do board externo criado para o cliente.

## Rotas novas

```
POST /api/agentes-trello/board-cliente/:clientId   — cria board para o cliente
GET  /api/agentes-trello/board-cliente/:clientId   — retorna board_id + listas
POST /api/agentes-trello/webhook-externo           — webhook do board externo
POST /api/agentes-trello/card-sessao/:sessionId    — card da sessão no board do cliente
```

## Webhook externo

Quando cliente comenta em card do seu board:
1. `POST /api/agentes-trello/webhook-externo` recebe o evento
2. Sistema identifica cliente pelo boardId
3. Agente designado (campo `agente_atendimento_id` em clients) gera resposta
4. Resposta postada como comentário no card

## Toggle por agente

`trello_externo_ativo` boolean — quando false, o webhook ignora os cards deste agente.
Configurável em AbaIntegracoes (global) e por agente em AbaCapacidades.

## URL pública dos webhooks

- Interno: `https://{REPLIT_DOMAIN}/api/agentes-trello/webhook`
- Externo: `https://{REPLIT_DOMAIN}/api/agentes-trello/webhook-externo`

Ambas expostas na AbaIntegracoes com botão "Copiar URL" para registrar no Trello.
