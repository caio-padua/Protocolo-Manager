# Verificação da atualização do Onboarding

## Objetivo
Confirmar que os números do painel mudam sem recarregar a página.

## Requisitos
1. Atualizar deve desabilitar o botão e mostrar o spinner durante o pedido, removendo ambos ao concluir.
2. A cada 60 segundos, fazer novo pedido e renderizar os novos totais, pacientes e agrupamentos.
3. Erros HTTP, de aplicação e de rede devem mostrar o alerta vermelho; um pedido posterior bem-sucedido deve recuperar o painel.
4. Pedidos e respostas de estatísticas não devem usar cache; a rota deve consultar o banco a cada pedido.
5. Desmontar o painel deve cancelar o intervalo.

## Casos extremos
Resposta HTTP com corpo aparentemente válido, erro após sucesso, falha inicial e saída da tela antes do próximo intervalo.

## Pronto
Testes de navegador com respostas controladas cobrem botão, spinner, passagem de 60 segundos, erro e recuperação, sem reload. Testes HTTP da rota real com banco simulado confirmam nova consulta por pedido e cabeçalho sem cache.

## Linhas vermelhas
Sem gravações em dados clínicos, envio de mensagens, mudança de layout, autenticação ou regras de agregação/tenant.
