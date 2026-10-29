# Alerta de bloqueio Concierge no Slack

## Objetivo
Avisar o CEO quando a trava de penalidade recusar acesso ao Concierge.

## Requisitos
1. POST /scheduling/requests e GET /scheduling/concierge-offer retornam 403 com code=CONCIERGE_BLOCKED quando a penalidade bloqueia.
2. Cada bloqueio dispara um alerta no canal CEO já usado pelo sistema, com CPF mascarado (123.***.***-45), tentativas registradas, horário BRT e método/rota fixos, sem query string.
3. O envio não é aguardado pela rota. Erros de conexão/configuração e rejeições Slack são registrados sem alterar o bloqueio.
4. A tela de oferta continua mostrando o bloqueio e a orientação para a Via Comum.
5. Não alterar cálculo de penalidades, contadores, pagamentos ou demais respostas.

## Casos extremos e pronto
Testar as duas rotas, CPF formatado, canal padrão/configurado, Slack pendente, rejeitado e não configurado. Confirmar que acessos permitidos não alertam e que nenhum CPF completo aparece na mensagem.

## Contexto
O helper atual é slack-reporter.ts (não slack.ts). GET atualmente retorna 200: será alinhado ao 403 exigido, preservando seus campos e adaptando o consumidor direto.
A leitura da nota remota de cobrança foi tentada e retornou HTTP 404; a implementação segue o motor e as regras locais existentes.
Revisão de conclusão realizada pelo mecanismo de conclusão da tarefa.
