# Histórico vazio no segundo retorno à clínica

## Objetivo
Comprovar que uma resposta válida vazia substitui documentos e pendências em cache em A → B → A → B.

## Requisitos
1. Reutilizar a matriz de retorno existente, variando clínica, empresa e ambas, sem recarregar a página.
2. Demonstrar cache preenchido em A e B antes de liberar os GETs de revalidação.
3. No segundo B, responder ao GET de offset 0 com `documents: []`, `dispatches: []`, `pendingOperations: []` e `nextOffset: null`.
4. Exigir a mensagem “Nenhum pedido registrado para este cliente.”, ausência de documentos e alertas de pendências, seleção/canais/consentimento limpos, paginação em zero e envio desabilitado.
5. Só então liberar as páginas antigas retidas de B e do retorno a A. Confirmar consumo do JSON sem depender de cancelamento; nenhum dado antigo pode reaparecer, nem transitoriamente.
6. Interceptar `/api/**`, bloquear métodos diferentes de GET e exigir somente GETs e zero POSTs.
7. Preservar os cenários existentes de retorno preenchido. Não alterar produção sem defeito comprovado.

## Falhas previstas e barreiras
| Risco | Causa | Evidência |
| --- | --- | --- |
| Cache sobreviver ao vazio válido | Merge em vez de substituição | Documento e pendência B visíveis antes da resposta; ausentes depois |
| Resposta atrasada repovoar histórico | Paginação antiga em trânsito | Liberar dois GETs após o vazio; contar JSONs e observar mutações |
| Autorizar envio herdado | Estado de seleção preservado | Preparar envio nas visitas anteriores e exigir controles limpos |
| Paginação permanecer antiga | Offset local não reiniciado | GET de segundo B em zero e ambos os botões de paginação desabilitados |
| Envio real | Interceptação incompleta | Guarda global de métodos, zero POSTs |

## Pronto e limites
Seis novas combinações passam no Chromium e a suíte do arquivo permanece aprovada.
Captura sintética registra o estado vazio final. Revisão independente pelo fluxo
de conclusão. Sem banco, APIs reais, envio, autenticação alterada ou publicação.
Não certifica autorização multiclínica no servidor.

## Evidência — 30/10/2026
- `pnpm exec playwright test e2e/exam-request-idempotency.spec.ts --workers=2`: 83 aprovados, incluindo seis casos novos de histórico vazio.
- Após organizar a matriz sem alterar cenários, `pnpm exec playwright test e2e/exam-request-idempotency.spec.ts --grep 'A → B → A → B' --workers=2`: 12 aprovados.
- Os casos vazios confirmam oito corpos JSON processados, incluindo as páginas antigas de A e B liberadas depois do vazio; observador sem vazamentos e zero POSTs.
- Captura `retorno-clinica-cache-vazio.png` conferida: mensagem vazia, nenhum documento ou pendência, zero selecionados, canais/consentimento desmarcados e envio desabilitado.
- Frontend iniciado normalmente; captura independente da página inicial carrega a estrutura, mas retorna 502 nas consultas por estar sem API. A jornada alvo foi verificada com interceptação integral e respostas sintéticas.
- Produção preservada: nenhuma mudança em componentes, servidor, banco ou autenticação. Nenhum novo aprendizado durável de arquitetura; permanece o contrato de isolamento já documentado.
