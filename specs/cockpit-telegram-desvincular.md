# Desvinculação do Telegram no cockpit

## Objetivo
Permitir ao colaborador remover o vínculo Telegram do paciente sem ferramentas técnicas.

## Requisitos
1. Exibir “Desvincular Telegram” somente para paciente vinculado no card Telegram do cadastro do cockpit atual e do componente legado.
2. Pedir confirmação informando que os envios serão interrompidos até nova vinculação; cancelar não chama a API.
3. Enviar DELETE autenticado para `/api/clients/:id/telegram`, impedir cliques repetidos e manter o vínculo visível enquanto aguarda.
4. No sucesso, atualizar imediatamente o cache do paciente e revalidar os dados relacionados, sem recarregar a página.
5. Exibir erro compreensível para 404, 500 e falha de rede, sem ocultar o vínculo em caso de falha.
6. Garantir que o endpoint realmente limpe o vínculo, com isolamento por empresa. Corrigir a rota duplicada que hoje intercepta o DELETE com a lógica de reenvio.

## Casos extremos
- Mudança de paciente: mutação recebe ID explícito e atualiza apenas o cache desse paciente.
- Resposta de erro sem JSON: usar mensagem de erro padrão com o código HTTP.
- Paciente já desvinculado: botão ausente; exclusão repetida permanece idempotente.

## Pronto
Testes de interface cobrindo confirmação, cancelamento, sucesso e erros; teste do endpoint; aplicação iniciando e captura visual da rota pública.

## Linhas vermelhas
Não apagar pacientes ou mensagens, não alterar credenciais do bot, motor clínico ou regras dos demais canais. A central de auditoria é global e não deve desvincular pacientes.
