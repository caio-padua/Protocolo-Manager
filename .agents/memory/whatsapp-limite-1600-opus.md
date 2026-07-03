---
name: WhatsApp 1600 chars (Twilio 21617) x Mensageria Opus
description: Mensagem rica do Opus estoura o limite do WhatsApp; precisa truncar antes de enviar
---

Twilio recusa corpo de WhatsApp acima de 1600 caracteres com erro **21617**
("concatenated message body exceeds the 1600 character limit"), HTTP 400.

A mensagem RICA da Mensageria Opus (abertura + status Dr. Caio + prescricao de
varios periodos + fala + elogio + observacao + assinatura longa) pode passar de
1600 quando o periodo tem muitos itens. O motor real (lembrete-periodo) manda 1
periodo com as formulas reais do cliente — em geral cabe, mas nao ha garantia.

**Regra:** antes de `sendWhatsapp`, truncar o corpo abaixo de ~1500 chars num
limite de paragrafo/frase (`lastIndexOf("\n\n")` ou `". "`), com sufixo "(...)".

**Why:** cada mensagem que estoura vira 400 silencioso (via cai para "link",
`sent:false`), o cliente nao recebe e o log so mostra HTTP 400 generico se nao
inspecionar o `text` do Twilio.

**How to apply:** vale para qualquer disparo que concatene blocos ricos
(galeria demo, lembrete por periodo, doc de marca com legenda). `sent:false` +
`via:"link"` com erro HTTP 400 = suspeitar de 21617 primeiro.
