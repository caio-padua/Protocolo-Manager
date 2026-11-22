---
name: Evolution API (WhatsApp por QR Code)
description: canal provisório por clínica; homologação com lista de contatos autorizados; o que já foi provado com servidor real
---
- Chave e token do webhook no cofre com id da empresa na chave; webhook só registra, nunca responde; envio só humano e conectado; "entregue" só por webhook.
- Homologação (padrão ligado): só números de EVOLUTION_CONTATOS_AUTORIZADOS (vírgula) enviam/recebem; lista vazia bloqueia tudo; sai só com EVOLUTION_HOMOLOGACAO=false.
- Servidor real da Evolution (Railway, instância paxmed-teste) respondeu: conexão=conectado, envio aceito, webhook avançou aceito→enviado.
**Why:** "Resposta inesperada" vinha da tela chamar /api/evolution/* SEM o cabeçalho Authorization (401 virava erro_do_provedor); tela de comunicação precisa de collabAuthHeaders.
**How to apply:** webhook foi registrado com o domínio de desenvolvimento (temporário); ao publicar, registrar de novo pelo botão da tela. Recebimento (entrada) ainda não provado; faltam 3 números na lista.
