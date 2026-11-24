# Alerta da limpeza diária de dispositivos

## Objetivo
Avisar o CEO quando a limpeza diária de `device_offer_limits` falhar.

## Requisitos e impacto
1. Reutilizar o job existente do api-worker, às 03h em America/Sao_Paulo; não criar outro agendamento.
2. Capturar falhas da importação e da purga. Registrar o erro e enviar alerta ao canal PADAXOR_SLACK_CHANNEL_ID.
3. Incluir identificação da tabela, resumo seguro do erro e timestamp BRT pela fonte central brt.ts.
4. Usar o envio Slack com verificação de resposta. Falha do Slack ou canal ausente deve ser registrada sem rejeição não tratada.
5. Em sucesso, registrar removed, inclusive zero; não enviar Slack em sucesso.
6. Preservar retenção, SQL, boot do servidor, outros jobs, perfis e regras do Concierge. Sem migração, rota ou tela.

## Falhas previstas
| Falha | Consequência | Barreira / teste |
|---|---|---|
| Banco indisponível | Limpeza não executada | Log e alerta com horário BRT |
| Slack rejeita ou perde conexão | Alerta não entregue | Capturar e registrar falha secundária |
| Canal vazio | Destino desconhecido | Log explícito, sem destino inventado |
| Erro com credenciais ou marcação Slack | Exposição / menção indevida | Resumo seguro existente e escape de &, <, > |
| UTC em outro dia | Data enganosa | Relógio fixo junto à meia-noite UTC |

## Pronto
Testes isolados executam o callback realmente agendado para sucesso com zero e várias linhas, falha de banco, falha Slack, configuração ausente e recuperação no próximo ciclo. Regressão da purga preservada. Banco e Slack simulados; nenhuma mensagem externa real. Visual e autorização clínica não se aplicam a job interno sem tela ou rota. Revisão pela conclusão da tarefa.

## Evidências
- `pnpm --filter @workspace/api-server exec vitest run src/tests/device-offer-cleanup-slack.test.ts src/tests/concierge-device-throttle.test.ts src/tests/telegram-worker-profile.test.ts --maxWorkers=1`
- `pnpm --filter @workspace/api-worker run typecheck`
- Reinício do worker no perfil restrito confirmou compilação e inicialização; esse perfil não agenda a limpeza das 03h. O callback diário foi executado somente nos testes isolados, sem purga real nem Slack real.
- Log de inicialização informou aviso de configuração de criptografia de desenvolvimento; não foi alterado por esta entrega.
