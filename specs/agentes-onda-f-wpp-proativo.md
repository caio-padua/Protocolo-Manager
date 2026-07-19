# Spec Onda F — WhatsApp Proativo + Canal Bidirecional

## Objetivo
Ao fim de cada conversa no Console IA Pro, o agente pode enviar um resumo por WhatsApp ao cliente.
O cliente pode responder e o agente retoma a conversa.

## Gatilhos de WhatsApp proativo

| Gatilho | Mensagem enviada | Opt-in necessário |
|---|---|---|
| Botão manual "Notificar cliente" no Console IA Pro | Resumo da conversa | Não (manual) |
| Toggle automático ativo + conversa encerrada | Resumo + próximos passos | Sim (toggle no agente) |
| Alerta vermelho detectado | Mensagem urgente ao cliente | Não (sempre envia) |
| Antepenúltima sessão | Lembrete de exames | Não (fluxo clínico) |

## Formato da mensagem (WhatsApp)

```
*PAXTER — [EMOJI] [NOME DO AGENTE]*
─────────────────────
[RESUMO EM 3 LINHAS DA CONVERSA]

📋 Próximos passos:
• [passo 1]
• [passo 2]

Responda esta mensagem para continuar o atendimento.
_PAXTER Clinical Intelligence System_
```

## Rota nova

```
POST /api/agentes-wpp/notificar   — envia WhatsApp do agente para cliente
GET  /api/agentes-wpp/config/:id  — lê config wpp do agente
POST /api/agentes-wpp/config      — salva config wpp do agente
```

## Canal bidirecional (futuro — fase 2)

Quando cliente responder o WhatsApp:
1. Webhook Twilio entrega mensagem em `POST /api/whatsapp/status`
2. Sistema identifica conversa pelo contexto (número do cliente)
3. Mensagem entra como nova mensagem na conversa do agente
4. Agente gera resposta via Claude e envia via WhatsApp

## Toggle

`wpp_proativo_ativo` boolean por agente.
Quando false: botão "Notificar" visível mas não dispara automaticamente — só manualmente.

## Configuração

Usa Twilio já configurado (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + whatsappFrom do cofre).
Se não configurado: botão mostra "WhatsApp não configurado — vá em Integrações".
