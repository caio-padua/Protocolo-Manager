# Documentos vazios com envio pendente no retorno à clínica

## Objetivo
Confirmar que documentos vazios não escondem uma operação legítima de B que exige conferência em A → B → A → B.

## Requisitos
1. Estender a matriz existente em `e2e/exam-request-idempotency.spec.ts`, com trocas de clínica, empresa e ambas, nas duas ordens de entrega antiga já cobertas.
2. Preparar seleção, canais e consentimento nas visitas anteriores, sem enviar.
3. No segundo B, comprovar o cache anterior antes de responder ao GET de offset zero com `documents: []`, `dispatches: []`, uma operação B `needs_review` e `nextOffset: null`.
4. Exigir tabela sem documentos, mensagem de lista vazia, exatamente uma pendência B visível com orientação de conferência, nenhuma pendência de A ou de páginas antigas, controles limpos e envio bloqueado.
5. Exigir paginação em zero: requisição atual em offset zero e ambos os botões desabilitados.
6. Liberar as páginas antigas de B e do retorno a A somente após a resposta atual; contar os JSONs processados e confirmar que o mesmo resultado persiste sem vazamento transitório.
7. Interceptar globalmente `/api/**`, responder apenas com dados sintéticos, recusar métodos diferentes de GET e exigir zero POSTs.
8. Não alterar código de produção sem defeito comprovado.

## Falhas previstas
| Risco | Barreira e evidência |
| --- | --- |
| Lista vazia esconder reserva incerta | Alerta B com uma operação e orientação de conferência apesar da tabela vazia |
| Cache ou resposta antiga repor documentos/pendências | Observador de mutações e verificações antes/depois dos dois JSONs atrasados |
| Consentimento anterior autorizar reenvio | Preparação prévia e exigência de controles desmarcados, zero selecionados e confirmação bloqueada |
| Paginação antiga sobreviver | Offsets registrados e botões desabilitados após terminar o carregamento |
| Efeito externo real | Guarda global GET-only, dados sintéticos e zero POSTs |

## Pronto e limites
As seis novas combinações e a regressão do arquivo passam no Chromium.
Captura sintética do painel final mostra a pendência apesar da lista vazia.
Revisão independente pelo fluxo de conclusão; sem banco, provedores reais ou publicação.
Não certifica autorização multiclínica no servidor.
