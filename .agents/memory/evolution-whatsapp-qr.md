---
name: Evolution API (WhatsApp por QR Code)
description: canal provisório por clínica; homologação com lista de contatos autorizados; o que já foi provado com servidor real
---
- Chave e token do webhook no cofre com id da empresa na chave; webhook só registra, nunca responde; envio só humano e conectado; "entregue" só por webhook.
- Homologação (padrão ligado): só números de EVOLUTION_CONTATOS_AUTORIZADOS (vírgula) enviam/recebem; lista vazia bloqueia tudo; sai só com EVOLUTION_HOMOLOGACAO=false.
- Servidor real da Evolution (Railway, instância paxmed-teste) respondeu: conexão=conectado, envio aceito, webhook avançou aceito→enviado.
**Why:** "Resposta inesperada" vinha da tela chamar /api/evolution/* SEM o cabeçalho Authorization (401 virava erro_do_provedor); tela de comunicação precisa de collabAuthHeaders.
**How to apply:** webhook foi registrado com o domínio de desenvolvimento (temporário); ao publicar, registrar de novo pelo botão da tela. Recebimento (entrada) ainda não provado; faltam 3 números na lista.

## Homologação supervisionada (lições)
- A lista EVOLUTION_CONTATOS_AUTORIZADOS é lida do ambiente do processo: trocou o segredo, reiniciar a API (tela só muda após reinício).
- Motores reais (lembretes de prescrição, Pulso, pedidos) enviam por Twilio/Telegram; NENHUM usa a Evolution. Pulso é Telegram com botão (não serve em texto simples).
- Teste isolado da Evolution recusa texto >1600 caracteres (nunca corta); prévias reais de clientes 11/12 passam disso.
- Cadastro de Dayana (cliente 12) tem o MESMO telefone do Dr. Caio (final 4000): receber nesse número não prova a Dayana.
- Entrega efetiva ("entregue"/"lido") e recebimento dependem de confirmação humana e de resposta de alguém da lista.
