---
name: Twilio WhatsApp — sent:true nao e entregue + janela 24h (erro 63016)
description: Por que um WhatsApp via Twilio "envia" mas nao chega; como diagnosticar de verdade e o que reabre a entrega
---

O retorno `sent:true` / status `queued|sent` da API de criar mensagem do Twilio prova SO que o
Twilio aceitou o pedido — NAO que entregou. A entrega real (`delivered` x `undelivered`/`failed`) e o
`error_code` so aparecem consultando depois a Messages API:
`GET /2010-04-01/Accounts/{SID}/Messages.json?To=whatsapp:+55...` (Basic auth SID:token).

Erro **63016** = mensagem livre (freeform) FORA da janela de atendimento de 24 horas do WhatsApp. No
WhatsApp so se pode mandar texto livre dentro de 24h apos a ULTIMA mensagem que o destinatario te
enviou. Passou de 24h: freeform e bloqueada (63016). Reabre de dois jeitos:
- o destinatario manda qualquer mensagem para o numero -> reabre 24h de freeform; ou
- usar um TEMPLATE pre-aprovado (unico jeito de iniciar contato fora da janela), que exige numero
  WhatsApp Business de PRODUCAO (o sandbox nao envia template aprovado).

Sandbox: o remetente e o numero publico **+14155238886**. Alem da janela de 24h, o sandbox tem
participacao por convite (o destinatario precisa ter feito "join <codigo>" uma vez). Sintoma classico
deste repo: mensagens entregues logo apos o CEO interagir, e dias depois `undelivered 63016` porque a
janela fechou.

**Why:** ja gastamos tempo achando que o envio falhou no codigo; o codigo estava certo (Twilio aceitou).
O problema e a regra de janela do WhatsApp, invisivel no retorno do send.

**How to apply:** ao "o WhatsApp nao chegou", NAO reenviar as cegas — consultar o status real primeiro
(rota dev-only `GET /api/brand/whatsapp-status?to=...` faz isso e mascara o numero). Se 63016: pedir o
destinatario mandar 1 mensagem ao numero (reabre 24h) OU migrar para numero de producao + template.
Diagnostico sempre com numero mascarado; nunca logar token nem telefone cru.
