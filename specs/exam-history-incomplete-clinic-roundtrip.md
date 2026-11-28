# Histórico incompleto no segundo retorno à clínica

## Objetivo
Comprovar que HTTP 200 com contrato incompleto não apaga as últimas pendências conhecidas no retorno A → B → A → B.

## Requisitos e impacto
1. Novo teste em `e2e/exam-request-idempotency.spec.ts`: jornada A → B → A → B com clínica, empresa e ambas, e quatro contratos inválidos (12 casos), sobre o painel atual `ExamDocumentHistoryPanel`.
2. No GET de offset zero do segundo B, HTTP 200 com `documents` ou `pendingOperations` ausente ou null.
3. Exigir erro explícito, sem a mensagem de histórico vazio, sem alerta de pendências e sem seleção marcada.
4. Reter três páginas antigas (A, B e retorno a A) e liberá-las após o erro; nada herdado aparece.
5. Interceptar toda `/api/**`; somente GETs, zero POSTs, uma única navegação.
6. Produção: `ExamDocumentHistoryPanel` passa a validar o contrato e falhar com erro explícito.

## Limite conhecido
O painel atual remonta com chave de cache nova a cada troca de sessão. Assim, ao voltar a B não há cache das últimas pendências para exibir; o aviso "Últimas pendências conhecidas" só aparece se houver dados da mesma montagem. Preservar pendências entre montagens exige mudança de desenho, não feita aqui. Seleção e consentimento não existem mais nesse painel.

## Pronto
12 casos passam no Chromium com dados simulados. Não certifica o servidor multiclínica.
