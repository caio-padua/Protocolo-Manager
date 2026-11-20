---
name: Anexos de mensagem e Curadoria Clínica
description: biblioteca de anexos com interruptor por arquivo e por mensagem; nome Curadoria Clínica
---
Biblioteca de arquivos por clínica; cada arquivo tem interruptor por mensagem (sem ligação = desligado). Chaves: categorias de comunicação + lembrete_paxmed.

**Why:** o CEO quer anexar o mesmo manual (MFC, PAM, Tirar dúvidas) em várias mensagens e escolher quais seguem.

**How to apply:** nova mensagem com anexo = chamar enviarAnexosDaMensagem(chat, empresa, chave) depois do texto e registrar a chave em MENSAGENS_EXTRAS. Tela de Pedidos dos Clientes agora se chama Curadoria Clínica (rota /pedidos-medicos preservada). Ainda sem anexo: mensagens de WhatsApp, confirmação de visita, receituário, exames, atendimento.

## Aviso de pedido recebido + oferta do PAM
- Decisão do CEO: envio nasce em modo "teste" (só lista de teste); "ligado" é ordem do CEO, nunca ligar sozinho.
- Não existe "PAM ativo" em tabela: a isenção vem do benefício Member ativo; sem ele, oferta do PAM.
- Falha depois de tentar enviar = estado "incerto", nunca "recusado": reenvio automático só quando nada saiu.

## Anamnese nova na consulta
- Decisão do médico: anamnese nova herda só o que não muda (fixa/acumula); estado atual vem em branco. Classificação por pergunta é proposta, revisável pelo médico.
- Comparar anamneses sempre pelo id numérico da pergunta (perguntaId repete).
