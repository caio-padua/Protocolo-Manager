# Histórico de exames: erros atrasados de outra clínica

## Objetivo
Comprovar que uma consulta antiga de histórico não substitui o histórico já carregado da clínica atual.

## Requisitos
1. Ampliar o cenário existente em `e2e/exam-request-idempotency.spec.ts`, preservando o sucesso atrasado e acrescentando respostas antigas 401 e 500.
2. Cruzar os três resultados com mudança apenas de `clinic.id`, apenas de `empresaId` e de ambos.
3. Manter paciente, médico, token e página montada, com revalidação de identidade bem-sucedida.
4. Reter a consulta antiga, confirmar o sucesso do histórico novo e só então liberar a resposta antiga, sem depender de cancelamento da requisição.
5. Interceptar todas as chamadas `/api/**`, observar alterações transitórias antes de liberar a nova identidade e exigir zero POSTs.
6. Após processar a resposta antiga, manter documento e pendência atuais, ausência de dados/erros antigos, nenhuma seleção e envio desabilitado.

## Falhas previstas e barreiras
| Risco | Causa | Barreira e teste |
| --- | --- | --- |
| Histórico antigo reaparece, mesmo por um instante | Cache ou resposta com escopo incorreto | Observador de alterações e verificações finais |
| Erro antigo substitui sucesso atual | Erro de consulta anterior aplicado ao observador novo | Respostas 401/500 apenas na consulta antiga após sucesso novo |
| Falso positivo por cancelamento | Corpo antigo nunca consumido | Retirar sinal de cancelamento e contar corpos processados |
| Recusa de identidade confundida com erro de histórico | Falha simulada na rota errada | Identidade sempre responde 200; somente histórico antigo responde erro |
| Envio real ou repetido | Chamada não interceptada | Interceptação global, dados sintéticos e zero POSTs |

## Definição de pronto
Os nove cenários passam no Chromium, junto à regressão do arquivo de testes; revisão independente executada pelo fluxo de conclusão da tarefa.

## Linhas vermelhas
Sem alteração de motores clínicos, contratos, autenticação, dados reais ou comportamento de produção. Não acessar pacientes ou provedores reais.

## Dependência impeditiva identificada
O arquivo de testes continha um marcador isolado de conflito, impedindo a análise sintática e qualquer execução. Remover somente esse marcador preservando todos os cenários é pré-requisito para validar a ampliação.

## Evidência de execução
- Comando: `pnpm exec playwright test e2e/exam-request-idempotency.spec.ts --workers=2`.
- Resultado: 47 testes aprovados no Chromium, incluindo as nove combinações de resultado e escopo, em aproximadamente 1,6 minuto.
- Ambiente: frontend local com todas as chamadas de interface de programação de aplicações interceptadas e dados sintéticos; nenhum provedor ou paciente real acessado pelos cenários.
- Captura conferida: `historico-clinica-isolado.png` do cenário de mudança simultânea de clínica e empresa com erro antigo 500, produzida no diretório ignorado `test-results/`.
- Limite: a captura independente da página inicial renderiza o painel, mas apresenta 502 nas consultas porque o servidor de interface de programação de aplicações está parado; não valida integração real. A jornada alvo foi validada pelo navegador nos testes isolados.
- Nenhuma mudança necessária nos componentes de produção: o isolamento atual passou nos cenários novos.
