---
name: WhatsApp — segurança da entrada, modo teste e modelos
description: regras do webhook de entrada, identidade/clínica, chaves de teste, modelo aprovado e janela de 24 h
---
- Entrada sem assinatura Twilio válida = 403 (nunca "dev aceita"); rota de configuração do Twilio exige colaborador + dono da plataforma.
- Identidade só por número COMPLETO e único; sufixo só filtra consulta. Dado clínico só com cliente único E canal (empresas.twilio_numero/wa_numero) da mesma clínica do cliente.
- Chaves de ambiente (não gravadas por código): WHATSAPP_INBOUND_AUTORESPOSTA (padrão desligada), WHATSAPP_MODO_TESTE + WHATSAPP_CONTATO_TESTE (um único número; sem contato = nada sai; em teste nada espelha no Telegram).
- Fora das 24 h só modelo aprovado (sendWhatsappConformeJanela); status de entrega nunca retrocede.
**Why:** pedido do CEO — testar sem disparar a pacientes e sem identificar por parte do telefone.
**How to apply:** número de envio ainda é o sandbox 8886; remetente real depende de aprovação da Meta/Twilio e de cadastrar o número na empresa.
