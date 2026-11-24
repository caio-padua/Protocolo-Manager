# Alerta de falha no reenvio do RAS FAP

## Objetivo
Garantir que a falha de e-mail do reenvio manual alerta o canal Slack configurado.

## Requisitos
1. Exercitar por HTTP a rota real `POST /api/ras/physical/:protocolId/reenviar-email`, com dados sintéticos e dependências externas simuladas.
2. Verificar no spy de `postSlackAlert` que o primeiro argumento preserva integralmente `PADAXOR_SLACK_CHANNEL_ID`.
3. Cobrir resposta de recusa e exceção do serviço de e-mail.
4. Preservar respostas existentes (502 na recusa, 500 na exceção); sucesso e canal ausente não disparam alerta.

## Impacto e falhas previstas
Somente rota de reenvio e testes. Sem tela, migração, acesso a dados reais ou envio externo durante testes.
O código atual não tinha alerta: acrescentar chamada explícita ao Slack, com texto de envio não confirmado.
Falha do Slack não deve substituir o erro original do e-mail. Não alertar falhas anteriores ao envio como se fossem falhas de e-mail.

## Pronto
Testes de integração com spy verificam canal, erro e protocolo, além de ausência de alertas em sucesso e canal ausente; regressões relacionadas passam com um worker.

## Linhas vermelhas
Não alterar autenticação, isolamento de clínica, geração do PDF, contrato HTTP ou fluxo de emissão original. Não publicar nem enviar mensagens reais.
