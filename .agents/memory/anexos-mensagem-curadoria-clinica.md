---
name: Anexos de mensagem e Curadoria Clínica
description: biblioteca de anexos com interruptor por arquivo e por mensagem; nome Curadoria Clínica
---
Biblioteca de arquivos por clínica; cada arquivo tem interruptor por mensagem (sem ligação = desligado). Chaves: categorias de comunicação + lembrete_paxmed.

**Why:** o CEO quer anexar o mesmo manual (MFC, PAM, Tirar dúvidas) em várias mensagens e escolher quais seguem.

**How to apply:** nova mensagem com anexo = chamar enviarAnexosDaMensagem(chat, empresa, chave) depois do texto e registrar a chave em MENSAGENS_EXTRAS. Tela de Pedidos dos Clientes agora se chama Curadoria Clínica (rota /pedidos-medicos preservada). Ainda sem anexo: mensagens de WhatsApp, confirmação de visita, receituário, exames, atendimento.
