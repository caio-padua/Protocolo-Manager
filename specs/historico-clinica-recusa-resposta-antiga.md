# Histórico clínico: recusa atual e resposta antiga

## Objetivo
Provar que uma falha atrasada da clínica A não remove a recusa de acesso ao histórico da clínica B.

## Requisitos
1. Ampliar a matriz existente de clínica, empresa e ambas, preservando os casos anteriores.
2. Recusar o histórico inicial de B com 401 e 403 antes de liberar a página retida de A, com erro HTTP diferente ou falha de rede.
3. Conferir recusa persistente e ausência de alterações transitórias, documentos, pendências ou consentimento herdados de A.
4. Recuperar somente ao liberar uma nova consulta autorizada de B, no offset zero, mantendo seleção e consentimento vazios e envio bloqueado.
5. Interceptar integralmente `/api/**`, usar apenas dados sintéticos e exigir zero POSTs.

## Impacto e falhas previstas
- Produtores: respostas sintéticas de identidade e histórico. Consumidores: painéis PedidosExamesPanel e ExamRequestHistoryPanel reais.
- Cache ou erro antigo pode substituir B: reter A até a recusa de B e observar mutações do histórico e controles antes de liberar A.
- Consentimento de A pode atravessar a troca: selecionar documento/canal e confirmar em A sem enviar; observar B durante a troca e recuperação.
- Recuperação prematura pode ocultar a recusa: reter a nova consulta de B e conferir ausência de documentos até a resposta autorizada.
- Sem efeitos externos ou persistência real: todas as rotas da API respondem sinteticamente; nenhum envio é permitido.

## Pronto
Novos cenários e regressão do arquivo passam no Chromium, com capturas sintéticas de recusa/recuperação e verificação de zero POSTs. Revisão independente pela conclusão da tarefa.

## Linhas vermelhas
Não modificar autorização, contratos, componentes, banco, dados reais nem serviços externos para obter aprovação dos testes. Esta prova de interface simulada não certifica isolamento do servidor.

## Evidência de execução
- Chromium local: `pnpm exec playwright test e2e/exam-request-idempotency.spec.ts --grep 'recusa-atual' --workers=2`: 18 cenários aprovados.
- Regressão: `pnpm exec playwright test e2e/exam-request-idempotency.spec.ts --workers=2`: 95 testes aprovados, incluindo os 18 novos.
- Após integrar os novos cenários da branch principal, o mesmo comando aprovou os 113 testes da versão combinada.
- Os cenários verificam zero POSTs, interceptação integral da API, mensagens de recusa estáveis, observadores sem vazamento transitório e recuperação GET autorizada sem consentimento herdado.
- Capturas de recusa e recuperação produzidas pelo próprio teste; não houve alteração nos componentes de produção.
- O preview geral renderiza, mas suas consultas reais retornam 502 com o workflow da API desligado. A validação clínica acima usa exclusivamente a API sintética interceptada e não depende desse serviço.
