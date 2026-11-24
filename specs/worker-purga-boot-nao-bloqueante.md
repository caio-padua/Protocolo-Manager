# Purga de idempotência não bloqueia o boot

## Objetivo
Confirmar que a manutenção de concierge_webhook_eventos não impede a inicialização do worker.

## Requisitos e pronto
1. Executar startWorkerJobs no perfil completo e observar `Worker iniciado` mesmo com uma consulta da purga pendente.
2. Falha de conexão ou de preparação da tabela deve registrar `Worker: falha na purga de concierge_webhook_eventos` com `{ err, origem: "boot" }`, sem rejeição não tratada.
3. Cobrir erro durante CREATE, ALTER e DELETE, além de sucesso após atraso.
4. Verificar que o cron mensal continua registrado às 03:30 do dia 1, em America/Sao_Paulo.

## Impacto e falhas previstas
O teste executa o worker e a implementação real de purgeEventosAntigos/ensureEventosTable.
Somente a fronteira db.execute é simulada. Outros efeitos de boot (Drive, certificado,
Telegram e verificação OTP) são simulados e os agendamentos e temporizadores não executam
envios. Módulos são recarregados por cenário para reiniciar os singletons.

| Falha | Consequência potencial | Barreira e evidência |
| --- | --- | --- |
| CREATE/DELETE demora | Boot aguardaria banco | Promessa controlada, log de início antes de resolver/rejeitar |
| Conexão recusada | Rejeição não tratada encerraria processo | Erro simulado ECONNREFUSED, captura de log e continuidade |
| Esquema indisponível | Preparação ou DELETE falharia | Erros 42P01 em CREATE/ALTER/DELETE tratados pelo worker |
| Falha confundida com sucesso | Operador não perceberia manutenção falha | Nenhum log de conclusão após erro |

## Linhas vermelhas e limites
Não mudar retenção, idempotência, penalidades, esquema ou jobs de produção.
Não acessar banco real nem enviar mensagens. Não há alteração de interface; captura visual,
identidade de médico/cliente e sessão não se aplicam a este teste de inicialização.
Os testes provam o fluxo real de inicialização em ambiente isolado, não a disponibilidade
do banco de produção nem os demais jobs em operação.

## Evidência executada
Comando, a partir de artifacts/api-server:
`pnpm exec vitest run src/tests/worker-purga-boot.test.ts src/tests/telegram-worker-profile.test.ts src/tests/concierge-penalidade-lib.test.ts src/tests/concierge-penalidade.test.ts --maxWorkers=1`

Resultado: quatro arquivos aprovados, 61 testes aprovados, incluindo sete novos
cenários do boot. Sem rejeições não tratadas; `git diff --check` sem erros.
O comportamento existente atendeu aos requisitos, sem mudanças no código operacional.
Não foi reiniciado o worker conectado aos serviços reais: o perfil de desenvolvimento
é restrito e não executa a purga mensal; o perfil completo foi exercitado isoladamente.
