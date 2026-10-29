# Reenvio de receituário pela tela

Objetivo: permitir reenviar uma prescrição emitida sem terminal.

1. Exibir histórico de prescrições emitidas na tela existente, filtrado pelo cliente quando selecionado.
2. Cada linha oferece “Reenviar e-mail”, usando POST /api/prescriptions/:id/reenviar-email.
3. Bloquear novo clique durante o envio e informar que gerar o PDF pode levar dezenas de segundos.
4. Mostrar os destinatários retornados apenas quando emailSent=true. Falha HTTP, de rede ou emailSent=false deve permanecer visível na linha.
5. Atualizar o histórico após emissão; permitir repetir uma tentativa encerrada.

Extremos: histórico vazio/indisponível, ausência de e-mail do paciente (mostrar somente destinatários reais), resposta sem confirmação de envio, mudança de cliente.

Pronto: testes de interface com API simulada para sucesso, espera, falha e nova tentativa; nenhum e-mail real disparado pela validação.

Linhas vermelhas: não alterar motor, PDF, dados de pacientes ou regras de emissão. Revisão final pelo mecanismo de conclusão da tarefa.

Complemento de integração: compartilhar o histórico com a aba Prescrição do cockpit; enviar clientId nas duas chamadas de emissão regulatória. No servidor, reenvio exige colaborador autenticado cujo cadastro seja isPrimaryDoctor, prescrição emitida e empresa resolvida pelo middleware.

Limite: este histórico lista registros de /prescriptions. A geração visual independente em /receituario/emitir-cliente não é convertida em emissão regulatória por esta tarefa.
