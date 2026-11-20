# Acompanhamento de pedidos de exames pelo Telegram

## 1. Objetivo e limites

1.1. Depois que um profissional envia um pedido de exames pelo Telegram e o provedor confirma o envio real, o PaxMed pode iniciar um acompanhamento automático.

1.2. O primeiro contato pergunta se o cliente recebeu o pedido, após um intervalo configurado pela clínica.

1.3. O segundo contato pergunta se o cliente conseguiu agendar os exames, quatro dias após o aceite do envio original.

1.4. O fluxo vale somente para pedidos de exames enviados pelo canal Telegram. Não vale para prescrições, resultados de exames, e-mail ou WhatsApp.

1.5. O acompanhamento fica desligado por padrão. A clínica precisa configurar de uma a setenta e duas horas antes do primeiro contato.

1.6. Alterar a configuração não cria acompanhamentos retroativos. O intervalo usado fica registrado no envio original.

1.7. Uma operação de envio com vários arquivos gera um único acompanhamento. O fluxo não envia arquivos nem repete o pedido.

1.8. As respostas são classificadas por regras exatas e limitadas. A inteligência artificial não redige mensagens deste fluxo, não interpreta sintomas e não dá orientação clínica.

## 2. Fonte de verdade e sequência

2.1. O registro de auditoria do envio existente continua sendo a fonte de verdade para cliente, clínica, documentos, canal e aceite do provedor.

2.2. A nova tabela guarda somente a fila, os horários, o estado do acompanhamento e o vínculo com a auditoria original. Não duplica arquivos, conteúdo do pedido ou dados de destino.

2.3. Antes de chamar o provedor, o sistema reserva a fila com o chat já vinculado e o identificador único da auditoria. Ela só fica ativa após confirmação do envio completo. Reinício e repetição não duplicam casos nem mensagens.

2.4. Todas as mensagens do lote Telegram precisam ser aceitas de forma real para ativar a fila. Simulação, recusa, erro ou resultado parcial não iniciam acompanhamento.

2.5. Cada etapa é reservada antes de chamar o Telegram. Resultado incerto não é reenviado automaticamente; permanece visível para conferência humana.

2.6. Antes de cada envio, o sistema confirma novamente que o cliente continua ativo, que o chat continua ligado exclusivamente ao mesmo cadastro e que o atendimento não foi assumido por uma pessoa.

2.7. Respostas de acompanhamento são processadas antes do atendimento automático genérico. A identidade precisa coincidir com a mensagem recebida, o cliente, a clínica e o chat atualmente vinculado.

## 3. Regras de resposta

3.1. Na pergunta de recebimento, uma resposta curta e inequívoca de recebimento registra “recebido” e mantém a pergunta de agendamento para o quarto dia.

3.2. “Não recebi”, pedido de ajuda, pergunta clínica, texto ambíguo ou qualquer resposta fora das opções reconhecidas interrompe as mensagens futuras e encaminha a conversa à equipe.

3.3. Na pergunta de agendamento, uma resposta curta e inequívoca de que conseguiu agendar registra “agendado” e encerra o caso.

3.4. “Ainda não”, pedido de ajuda, pergunta clínica, texto ambíguo ou qualquer resposta fora das opções reconhecidas interrompe o fluxo e encaminha a conversa à equipe.

3.5. Quando não há resposta à primeira pergunta, a segunda continua prevista para quatro dias após o envio original.

3.6. Uma resposta somente atualiza um caso ativo compatível com aquela etapa. Uma resposta antiga ou sem caso ativo não é atribuída por nome nem a outro pedido.

## 4. Encerramento e operação humana

4.1. A equipe pode encerrar o acompanhamento no histórico do cliente e registrar um motivo controlado, incluindo “pedido cancelado”.

4.2. O encerramento do acompanhamento não apaga nem altera o pedido de exames original.

4.3. O esquema atual do pedido de exames não possui um estado de cancelamento. Por isso, não há cancelamento automático quando um pedido é cancelado fora deste fluxo; a equipe deve registrar “pedido cancelado” ao encerrar o acompanhamento.

4.4. Assumir a conversa por uma pessoa cancela os contatos futuros do acompanhamento.

4.5. Desativar o canal Telegram ou remover o intervalo da clínica interrompe as etapas ainda não enviadas e deixa o motivo visível no histórico.

## 5. Configuração e apresentação

5.1. O painel do Telegram, restrito ao CEO, lista as clínicas ativas e permite configurar ou desativar o intervalo em horas por clínica.

5.2. O histórico de pedidos de exames mostra o estado, a próxima etapa, os horários e o resultado de envio, sem expor identificador de chat, endereço, conteúdo clínico ou detalhes internos da auditoria.

5.3. O histórico também permite encerrar um acompanhamento, com confirmação explícita e motivo controlado.

5.4. O sistema distingue “aceito pelo provedor” de “recebido no aparelho”; a confirmação do provedor não prova leitura pelo cliente.

## 6. Impacto e falhas previstas

| Falha ou condição | Comportamento obrigatório | Evidência visível |
|---|---|---|
| Clínica sem intervalo configurado | Não criar acompanhamento nem enviar pergunta | Configuração desligada |
| Envio simulado, recusado ou parcial | Não iniciar acompanhamento | Estado do envio já existente |
| Falha antes de reservar uma etapa | Não chamar o provedor | Caso continua pendente |
| Provedor recusa a mensagem | Não repetir automaticamente | Etapa marcada como falha |
| Processo cai durante o envio | Não repetir automaticamente | Etapa marcada como incerta |
| Chat mudou, duplicou ou perdeu vínculo | Não enviar e encerrar com motivo de bloqueio | Estado consultável pela equipe |
| Pessoa assumiu o atendimento | Cancelar perguntas futuras | Caso encerrado por atendimento humano |
| Cliente responde “não recebi” ou pede ajuda | Registrar e encaminhar; não perguntar novamente | Resposta e estado de encaminhamento |
| Cliente escreve algo ambíguo ou clínico | Não interpretar nem usar resposta de inteligência artificial | Encaminhamento à equipe |
| Caso encerrado pela equipe como pedido cancelado | Cancelar etapas futuras sem alterar o documento original | Motivo e responsável registrados |
| Reinício ou repetição do trabalhador | Não duplicar fila, etapa ou resposta | Chaves únicas por auditoria e etapa |

## 7. Critérios de aceite

7.1. Apenas envios Telegram reais, completos e aceitos pelo provedor podem gerar uma fila.

7.2. A primeira pergunta respeita o intervalo da clínica; a segunda vence exatamente quatro dias após o aceite original.

7.3. Resposta de recebimento preserva a etapa de agendamento; respostas negativas, ambíguas, clínicas ou de ajuda impedem mensagens posteriores e acionam a equipe.

7.4. Resposta positiva de agendamento encerra o caso.

7.5. Respostas não são processadas com base somente em nome, e-mail ou texto livre semelhante.

7.6. Desativação, troca ou duplicidade do vínculo Telegram, atendimento humano e encerramento explícito impedem qualquer envio futuro.

7.7. O painel administrativo mostra configuração por clínica; o histórico autorizado mostra o estado do caso e permite encerrá-lo.

7.8. Os testes usam somente dados sintéticos e banco isolado. Nenhum teste envia mensagem real e nenhum deploy é executado.
