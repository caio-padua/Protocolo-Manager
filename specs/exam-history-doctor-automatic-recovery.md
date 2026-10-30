# Histórico: troca de médico durante recuperação automática

## Objetivo
Comprovar que a recuperação por intervalo de um médico não altera o histórico de outro, mantendo cliente e clínica.

## Requisitos
1. Usar o cockpit real com tráfego de interface integralmente sintético, sem banco ou provedores.
2. Carregar documentos e pendências do médico anterior, provocar erro 500 e iniciar a recuperação exclusivamente pelo intervalo de dez segundos com relógio controlado.
3. Reter essa recuperação, revalidar outro médico sem navegação e manter os mesmos cliente, clínica e empresa.
4. Estabilizar o histórico atual antes de liberar sucesso ou recusa 401 do médico anterior; cobrir também recusa 401 atual.
5. Remover cancelamento do transporte e contar leitura do JSON para comprovar chegada efetiva da resposta atrasada.
6. Verificar documentos, pendências, erro, seleção, canais e consentimento atuais antes e depois da resposta antiga; observar mutações para detectar exposição transitória.
7. Não realizar POST nem duplicar os cenários existentes de atualização manual ao trocar médico.

## Impacto e falhas previstas
Somente testes e esta especificação mudam. O produtor é a resposta sintética de histórico; consumidores são a consulta React Query e o painel real. A identidade é revalidada pelo evento normal da sessão.

| Risco | Causa | Consequência | Barreira e prova |
|---|---|---|---|
| Alto | Resposta antiga contamina nova consulta | Exposição entre médicos | Marcadores exclusivos, observação contínua e comparação do estado atual |
| Alto | 401 antigo substitui resultado atual | Bloqueio indevido ou perda de consentimento | Matriz sucesso/401 nos dois médicos |
| Alto | Cancelamento mascara o isolamento | Falso positivo | Transporte sem sinal e contagem após JSON |
| Alto | Recuperação dispara envio | Duplicação de mensagem clínica | Interceptar todos os métodos e exigir somente GET |
| Médio | Relógio aciona recuperação errada | Teste não cobre o intervalo após 500 | Contar requisições e offsets por médico |

## Pronto
Quatro combinações passam no Chromium; a consulta de recuperação do médico anterior chega depois da estabilização do atual, sem alteração final ou transitória e sem envio.

## Linhas vermelhas
Não alterar autenticação, painel, contratos, motores clínicos ou dados reais. Não publicar. A revisão independente é solicitada pelo encerramento da tarefa.

## Evidência de execução
- Ambiente: Chromium local via Playwright, API totalmente interceptada, relógio controlado, sem acesso a dados clínicos ou provedores.
- `pnpm exec playwright test e2e/exam-request-idempotency.spec.ts --grep 'isolar recuperação automática ao trocar médico' --workers=1`: quatro cenários aprovados.
- `pnpm exec playwright test e2e/exam-request-idempotency.spec.ts --grep 'isolar pendências ao trocar medico|isolar pendências ao trocar médico|isolar resposta de consulta ao trocar medico' --workers=1`: sete regressões existentes aprovadas.
- `git diff --check`: aprovado.
- Escopo da evidência: interface real com respostas sintéticas, não autorização real do servidor ou entrega externa. Não houve mudança no código da aplicação.
