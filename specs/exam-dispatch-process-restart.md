# Pedido de exames após queda real do processo

## Objetivo
Provar que uma mensagem aceita pelo provedor simulado não é reenviada após queda e reinício do processo servidor.

## Requisitos
1. Usar exclusivamente PostgreSQL temporário, documentos sintéticos e provedor local simulado, sem importar inicialização ou credenciais do servidor real.
2. Executar a rota real de envio e a implementação real da reserva em um processo filho; manter o provedor simulado e o banco fora desse processo.
3. Interromper com SIGKILL depois da resposta de aceite do provedor, antes da gravação do resultado na auditoria e na operação. Sincronizar por sinais explícitos, sem esperas arbitrárias.
4. Confirmar a morte do processo e consultar no PostgreSQL a reserva `in_progress`, sem resultado final e com auditoria ainda `requested`.
5. Iniciar outro processo com memória nova, repetir a solicitação original e também o mesmo conteúdo com outra chave; confirmar resposta recuperada, `needsReview: true`, mesma chave reservada e nenhum novo contato com o provedor.
6. Encerrar processos, servidor simulado, conexões e PostgreSQL mesmo quando uma asserção falhar. Limitar esperas para detectar travamentos.
7. Cobrir também SIGKILL após persistir o resultado do primeiro canal (`EMAIL`) na auditoria e na operação, bloqueando o retorno da gravação antes de iniciar `TELEGRAM`.
8. Nesse cenário, verificar no banco o resultado parcial com o ID da auditoria de e-mail, e as auditorias distintas: e-mail `provider_accepted` e Telegram `requested`. Após reiniciar no mesmo banco, ambas as repetições devem devolver exatamente o resultado parcial, exigir conferência e preservar integralmente reserva e auditorias, sem nenhum contato adicional com qualquer canal.
9. Cobrir falha da primeira gravação da operação após o aceite e a atualização da auditoria de e-mail. Rejeitar essa gravação antes de executar SQL e bloquear a tentativa de recuperação `needs_review` também antes de executar SQL; sinalizar ambas as etapas e encerrar com SIGKILL.
10. Nesse caso, a operação deve permanecer `in_progress` com resultados vazios, mas a auditoria de e-mail deve conservar `provider_accepted`, contagem de aceite e seu ID. Após reiniciar no mesmo PostgreSQL, repetir com a chave original e outra chave deve exigir conferência, preservar os mesmos registros e não contactar nenhum canal novamente. Não converter o aceite auditado em resultado persistido que não existe.

## Casos extremos
- Processo encerra antes de sinalizar a etapa esperada: falhar com diagnóstico.
- Provedor recebe contato inesperado após reinício: falhar pela contagem externa.
- Reserva persiste, mas resposta mente que concluiu: falhar nas asserções de estado e conferência.

## Pronto
Ensaio de reinício e suíte existente de pedidos de exames passam, sem alterar o comportamento de produção, sem chamadas externas e sem dados reais.

## Linhas vermelhas
Não expirar, liberar ou reenviar automaticamente reservas incertas. Não modificar banco de desenvolvimento/produção, motores clínicos ou telas.
