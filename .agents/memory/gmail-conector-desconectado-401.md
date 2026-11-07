---
name: Gmail conector desconectado = e-mail falha com Invalid Credentials
description: Falha de e-mail ao paciente com "Invalid Credentials" vem da autorizacao Google expirada (invalid_grant), nao do codigo da rota.
---
Status 'disconnected' no conector google-mail => Gmail devolve 401; so o usuario reautoriza (cartao de reconexao da integracao Gmail).
**Why:** diagnosticado ao emitir pedido de exames sem e-mail chegar; a rota estava correta.
**How to apply:** ver status do conector antes de mexer na rota; google-gmail.ts agora lanca mensagem clara de reconexao.
