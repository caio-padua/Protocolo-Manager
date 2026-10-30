# Histórico paginado: falha antiga após troca de clínica

## Objetivo
Confirmar que falhas da página antiga de A não alteram o histórico ou a autorização já carregados de B.

## Requisitos
1. Ampliar a matriz existente em `e2e/exam-request-idempotency.spec.ts` com paginação e respostas antigas 401, 403 e falha de rede.
2. Cobrir mudança de clínica, de empresa e de ambas, mantendo paciente, médico e token.
3. Carregar páginas 0 e 20 de A, reter offset 40, revalidar identidade com sucesso, carregar offset 0 de B e somente depois liberar a falha de A.
4. Não depender de cancelamento: remover o sinal de cancelamento e contar processamento do corpo ou rejeição de transporte no navegador.
5. Observar alterações transitórias e conferir documentos, pendências, identidade e controles de B. Selecionar documento, canal e consentimento em B, sem confirmar envio, para detectar revogação ou reinicialização indevida.
6. Interceptar todas as chamadas `/api/**` com dados sintéticos, exigir zero POSTs e nenhuma navegação adicional.

## Falhas previstas
| Risco | Causa | Barreira e evidência |
| --- | --- | --- |
| Erro de A substitui B | Consulta sem isolamento de escopo | Observador antes da nova identidade e após carregar B |
| Seleção ou autorização de B reiniciada | Falha antiga aplicada à instância nova | Controles selecionados e envio habilitado permanecem sem clicar |
| Teste passa por cancelamento | Resposta antiga não chega ao consumidor | Sinal removido; contagem de JSON/rejeição |
| Falha de rede confundida com erro HTTP | Corpo inexistente | `route.abort("failed")`, contador próprio de rejeições |
| Efeito externo real | Requisição não simulada | Interceptação global e zero POSTs |

## Pronto
Nove novos cenários passam, junto da regressão completa do arquivo. Conferir captura sintética produzida pelo teste. Revisão pelo fluxo de conclusão da tarefa.

## Linhas vermelhas
Sem dados reais, chamadas ao servidor ou provedores, mudanças de autenticação, motores clínicos ou contratos. Alterar componentes somente se a regressão demonstrar defeito.

## Evidência — 30/10/2026
- Comando: `pnpm exec playwright test e2e/exam-request-idempotency.spec.ts --workers=2`.
- Resultado: 59 testes aprovados no Chromium em 2,5 minutos, incluindo os nove novos casos. O arquivo é executado com um trabalhador pelo agrupamento do Playwright.
- As interceptações confirmaram offsets 0, 20 e 40 em A e somente 0 em B; zero POSTs e nenhuma navegação adicional em todos os casos ampliados.
- Corpos HTTP foram processados e rejeições de rede foram contadas no navegador, sem depender do cancelamento da consulta antiga.
- Observadores não detectaram dados antigos nem alterações do histórico, identidade ou controles já autorizados de B.
- Captura sintética conferida: `test-results/exam-request-idempotency-P-ab262-a-paginacao-—-rede-atrasada-chromium/historico-clinica-isolado.png`.
- Nenhuma alteração necessária em `ExamRequestHistoryPanel.tsx` ou `PedidosExamesPanel.tsx`: a implementação existente passou na regressão.
- Limites: validação isolada do navegador; não valida autorização real do servidor nem provedores. A captura geral do painel abre, mas consultas retornam 502 com o servidor de interface de programação de aplicações parado. Isso não afeta os testes integralmente interceptados.
