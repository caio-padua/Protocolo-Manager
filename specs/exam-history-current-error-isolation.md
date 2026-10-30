# Histórico: preservar o erro da clínica atual

## Objetivo
Comprovar que a falha atrasada de uma página de A não encobre o erro identificável de B.

## Requisitos
1. Ampliar a matriz sintética existente em `e2e/exam-request-idempotency.spec.ts`, cobrindo troca somente de clínica, somente de empresa e de ambas, com cliente, médico e sessão preservados.
2. Carregar páginas 0 e 20 de A, selecionar documento, canal e consentimento sem enviar, e reter página 40.
3. Revalidar B sem recarregar a página; fazer seu histórico em offset 0 falhar com erro 503 exclusivo antes de liberar erro distinto de A (401, 403, 500 ou rede).
4. Comprovar processamento das respostas/rejeições sem depender do cancelamento e observar o primeiro render de B e alterações transitórias.
5. Manter erro de B, identidade de B, ausência de dados e autorização herdados de A e envio desabilitado. A falha antiga não pode alterar controles nem mensagem de B.
6. Recuperar B exclusivamente por “Atualizar histórico”, novamente em offset 0, sem seleção, canais ou consentimento herdados, sem emissão.
7. Interceptar `/api/**` integralmente; usar somente dados sintéticos e exigir zero POSTs e uma única navegação.

## Impactos e falhas previstas
| Risco | Barreira | Evidência |
| --- | --- | --- |
| Erro antigo substitui ou limpa o atual | Escopo clínico da consulta | Erros distintos, observador e mensagem final |
| Consentimento de A autoriza B | Remontagem por escopo confirmado | A previamente autorizado; nenhum checkbox marcado em B |
| Cancelamento mascara corrida | Retirada do sinal no fetch sintético | Contagem de JSON e rejeição de rede |
| Recuperação consulta offset antigo | Reinício do histórico por escopo | Offsets de B iguais a `[0, 0]` |
| Teste gera efeito real | Interceptação global | Zero POSTs |

## Pronto e limites
Doze novos cenários e a regressão do arquivo aprovados; capturas sintéticas do erro e da recuperação conferidas. Revisão pelo fluxo de conclusão. Sem banco, provedores, dados reais ou alterações de autenticação/motores. Componentes só serão alterados se os testes demonstrarem defeito.

## Evidência — 30/10/2026
- `pnpm exec playwright test e2e/exam-request-idempotency.spec.ts --grep 'erro-atual-' --workers=2`: 12 aprovados.
- `pnpm exec playwright test e2e/exam-request-idempotency.spec.ts --workers=2`: 71 aprovados em 3,1 minutos.
- `git diff --check`: sem erros.
- Nos novos casos: A consulta offsets `[0, 20, 40]`; B falha e se recupera em `[0, 0]`; zero POSTs; uma navegação. Contadores comprovam processamento do erro HTTP ou da rejeição de transporte de A.
- Observadores sem vazamentos de dados/consentimento de A, nem mudanças transitórias no estado de erro de B durante a liberação de A.
- Capturas conferidas em `test-results/exam-request-idempotency-P-9b414-o-—-erro-atual-401-atrasado-chromium/`: `erro-atual-clinica-B.png` e `historico-B-recuperado-sem-envio.png`.
- Nenhuma mudança necessária nos componentes: os testes confirmaram o isolamento existente.
- Interface Vite iniciou corretamente; avisos preexistentes de chaves duplicadas em `arsenal/preview-validacao.tsx`. A captura geral abre o painel; API desligada produz 502 nas consultas reais. Testes e capturas clínicas usam interceptação integral, sem depender da API. Não se valida servidor, banco ou entrega externa nesta tarefa.
