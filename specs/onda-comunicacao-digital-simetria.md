# ONDA — Comunicação Digital SIMÉTRICA (WhatsApp × Telegram)

Data: 14/08/2026 · Pedido do CEO · Tela `/comunicacao/digital`

## 1. O QUE O CEO PEDIU (literal)

1. "Faltam campos" nos dois cartões.
2. **Regra de simetria:** se um serviço tem um campo, o outro tem o mesmo campo —
   **mesmo que não use**. O campo não usado aparece em **formato visual diferente**.
3. A **URL do webhook** tem de ficar **visível, com "olhinho"** (mostrar/ocultar).
4. "Quero tudo visual, não quero nada oculto. Ponto final."
5. "Não quero nada hard coded."

## 2. DIAGNÓSTICO DA TELA ATUAL (verificado na fonte)

| Defeito | Onde | Artigo violado |
|---|---|---|
| Cartão WhatsApp não tem NENHUM campo — só texto | `digital.tsx` linhas 214-225 | Art. 65 (tela autossuficiente) |
| WhatsApp manda o CEO ir para outra tela ("Gateway") | linha 219 | Art. 65 |
| Telegram tem 3 blocos que o WhatsApp não tem | linhas 242-308 | Art. 53 (posição fixa) |
| URL do webhook existe no dado mas é escondida | `WebhookStatus.url` nunca renderizado | pedido 3 |
| `@Paduaclinica_bot` escrito no código | linha 247 | pedido 5 |
| Chat ID do CEO só existe como variável de ambiente, sem campo | linha 262-275 | Art. 65 |

## 3. A SIMETRIA É REAL — NÃO INVENTADA (Art. 55)

Cada slot abaixo tem lastro verificado nos dois lados. Nenhum campo foi criado
para "encher espaço".

| # | Slot canônico | WhatsApp (Twilio) | Telegram | Lastro no código |
|---|---|---|---|---|
| 1 | Identidade do canal | Número remetente | `@username` do bot | `twilio.whatsappFrom` · `getMe` |
| 2 | Nome de exibição | **NÃO SE APLICA** (Twilio exibe o número) | Nome do bot (editável) | `setTelegramBotName` |
| 3 | Credencial primária | Account SID | Token do bot | `twilio.accountSid` · `telegram.botToken` |
| 4 | Credencial secundária | Auth Token | Segredo do webhook | `twilio.authToken` · `telegram.webhookSecret` |
| 5 | Destino de alerta ao CEO | Número do CEO | Chat ID do CEO | `CEO_WHATSAPP` · `PADAXOR_TELEGRAM_CHAT_ID` |
| 6 | URL do webhook de entrada | `https://<domínio>/api/whatsapp/inbound` | URL registrada no Telegram | `whatsapp-inbound.ts:194` · `getWebhookInfo` |
| 7 | Saúde do webhook | **NÃO VERIFICÁVEL** daqui (mora no painel Twilio) | `healthy` + pendentes | `telegram-webhook-guard` |

**Onde o campo não se aplica, o slot CONTINUA na mesma posição**, em formato
visual distinto, com a razão escrita — nunca some (Art. 53).

## 4. ARQUITETURA — a simetria nasce no SERVIDOR

O front **não decide** quais campos existem: ele varre o que a rota devolve.
Isso mata o hard code (pedido 5) e garante que os dois cartões nunca divirjam.

### Rotas novas em `routes/comunicacao.ts`

| Método | Rota | Proteção | Papel |
|---|---|---|---|
| GET | `/api/comunicacao/canais` | `requireCollaborator` | Devolve os 2 canais com os MESMOS 7 slots |
| PUT | `/api/comunicacao/canais/:canal/credenciais` | `requireCollaborator` | Grava só os campos preenchidos |
| POST | `/api/comunicacao/canais/:canal/revelar` | `requireCollaborator` | Olhinho — devolve o valor real |

### Contrato de um slot

```
{ slot, ordem, rotulo, tipo, aplicavel, editavel,
  isSet, masked, source, valorPublico, nota }
```

- `aplicavel:false` → o front renderiza o slot em formato "não se aplica".
- `masked` nunca traz o valor inteiro; o valor real só sai no `revelar`.

### Chaves de cofre novas (ADITIVO — nada é renomeado, Art. Regra de Ouro)

| Chave do cofre | Ambiente equivalente |
|---|---|
| `twilio.ceoWhatsapp` | `CEO_WHATSAPP` |
| `telegram.botToken` | `TELEGRAM_BOT_TOKEN` |
| `telegram.ceoChatId` | `PADAXOR_TELEGRAM_CHAT_ID` |

Ao gravar, o servidor **hidrata `process.env` na hora** e no boot lê o cofre de
volta — sem isso a tela mentiria: mostraria "configurado" enquanto o motor de
envio continuaria lendo um ambiente vazio.

## 5. PROVA EXIGIDA (Art. 69 — 4 níveis)

| Nível | O que provar |
|---|---|
| SMOKE | `curl` nas 3 rotas com token de colaborador |
| DADO | `SELECT` em `secure_settings` após gravar |
| VISUAL | Screenshot dos dois cartões lado a lado, contando os slots |
| LOG | Boot sem erro + log de revelação de credencial |

## 6. FORA DE ESCOPO

- Não mexer na tela `gateways.tsx` (Gateway de Comunicação continua existindo).
- Não apagar rota nem tela antiga (Regra de Ouro).
