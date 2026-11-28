---
name: Diagnóstico da conexão Gmail
description: Diferenciar autorização expirada de falha na leitura das credenciais e não confundir conexão com entrega.
---
Uma falha de envio pode resultar de autorização expirada ou de uma leitura antiga de credenciais que não reconhece uma conexão funcional; não presumir a causa apenas pela mensagem da tela.
**Why:** em um caso anterior houve autorização expirada; em outro, a consulta ao perfil da conta funcionava, embora a aplicação informasse Gmail desconectado.
**How to apply:** verificar a conexão configurada e consultar o perfil pelo conector atual antes de solicitar reconexão. Perfil acessível não prova permissão de envio nem entrega. Resultado de envio perdido exige conferência, nunca reenvio automático presumido.
