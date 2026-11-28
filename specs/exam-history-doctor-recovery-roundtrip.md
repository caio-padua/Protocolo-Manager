# Histórico: retorno ao médico durante recuperação automática

## Objetivo
Confirmar que a recuperação iniciada pelo intervalo em A não contamina o retorno A→B→A.

## Requisitos
1. Usar o cockpit atual (painel ExamDocumentHistoryPanel, recolhido por padrão e remontado a cada médico), cliente e clínica constantes, dois médicos e API inteiramente sintética, sem escritas.
2. Abrir o histórico em A, abrir o formulário de encerramento de acompanhamento, provocar 500 em uma atualização e reter o GET seguinte iniciado exclusivamente pelo intervalo de 10 segundos.
3. Trocar para B e retornar a A por eventos de autenticação sem navegar. Reter cada revalidação clínica e o histórico do retorno.
4. No retorno, nunca exibir dados de B nem o formulário de encerramento anterior; cache de A é permitido, não exigido.
5. Resolver o histórico atual de A com sucesso ou 401; somente depois liberar a recuperação antiga de A com sucesso ou 401.
6. Contar os JSON efetivamente consumidos, removendo o cancelamento no fetch de teste. Observar alterações transitórias e comparar o painel antes/depois da resposta atrasada.
7. Verificar pendências, advertência de dados conhecidos em erro, ausência de escritas (só GET) e de formulário restaurado.

## Falhas previstas e barreiras
| Gravidade | Causa | Consequência | Barreira / recuperação / teste |
| --- | --- | --- | --- |
| Alta | Resposta antiga de A chega quando A volta a ser atual | Sobrescreve histórico fresco ou erro atual | Reter resposta até retorno revalidado; matriz sucesso/401 nos dois GETs |
| Alta | Estado de edição reaproveitado pelo cache | Autorização de envio restaurada | Conferir seleção/canais/consentimento zerados em ambas as trocas |
| Alta | Cache compartilhado com B | Exposição de pendência errada | Observar DOM desde a revalidação e exigir somente dados de A no retorno |
| Média | Abort esconde resposta ou outro evento inicia GET | Falso positivo | Fetch sem signal, contador JSON, relógio controlado e offsets exatos |

## Pronto
Quatro combinações passam no Playwright, junto aos testes existentes de troca de médico durante recuperação. Capturas sintéticas registram o painel final.

## Linhas vermelhas
Não alterar código de produção, contratos ou banco. Não enviar mensagens reais. Não duplicar casos de atualização manual nem retorno entre clínicas.
