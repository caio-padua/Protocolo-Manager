# Histórico atual inválido após falha antiga

## Objetivo
Comprovar que um histórico de B com HTTP 200 e contrato incompleto mantém seu erro específico quando uma página atrasada de A falha.

## Requisitos
1. Ampliar `e2e/exam-request-idempotency.spec.ts` na jornada real do cockpit, exercitando `PedidosExamesPanel.tsx` e `ExamRequestHistoryPanel.tsx` juntos.
2. Cobrir troca de clínica, de empresa e de ambas, preservando paciente, médico e sessão.
3. Carregar páginas 0 e 20 de A, selecionar documento, canal e consentimento sem enviar; reter página 40.
4. Responder B em offset zero com HTTP 200, omitindo somente `documents` ou somente `pendingOperations`, mantendo os demais dados sintéticos para detectar aceitação parcial.
5. Após aparecer o erro específico do campo ausente, liberar erro distinto de A: 401, 403, 500 ou rede. Provar processamento mesmo sem cancelamento e preservar mensagem, identidade e controles de B.
6. Observar alterações transitórias desde antes do primeiro render de B: nenhum dado de A, dado parcial de B ou autorização herdada pode aparecer.
7. Recuperar pelo botão “Atualizar histórico”, com corpo válido no offset zero. Exibir somente dados de B sem seleção, canal ou consentimento herdado.
8. Interceptar integralmente `/api/**`; exigir zero POSTs e uma navegação, sem dados ou serviços reais.

## Impacto e falhas previstas
| Falha | Gravidade e consequência | Barreira e recuperação | Evidência |
| --- | --- | --- | --- |
| HTTP 200 incompleto aceito | Alta: documento ou pendência parcialmente confiável | Validação do contrato; atualização manual | Ambos os campos ausentes testados separadamente |
| Erro antigo substitui erro atual | Alta: mensagem e autorização de outra clínica | Escopo de consulta e editor; atualização em B | Quatro falhas antigas, corpo processado e observador de controles |
| Vazamento transitório | Alta: dado ou consentimento de A aparece em B | Reinicialização por escopo | Observadores antes da identidade de B e após seu erro |
| Recuperação reenvia | Alta: efeito externo indevido | Somente GET interceptado | Zero POSTs, consentimento vazio |

## Pronto
Matriz de 24 casos novos e regressão existente aprovadas no Chromium; capturas sintéticas de erro e recuperação. Revisão de conclusão pela plataforma.

## Linhas vermelhas
Não alterar motores, autorização, banco, dados clínicos ou integrações; não enviar mensagens nem publicar. O escopo é teste de regressão, sem redesenho de tela.

## Evidência de execução — 30/10/2026
- Ambiente: Vite local do PADCOM, Chromium do Playwright, dados e sessão sintéticos; todas as chamadas `/api/**` interceptadas nos cenários novos.
- `pnpm exec playwright test e2e/exam-request-idempotency.spec.ts --grep 'formato-atual-sem' --workers=2`: **24 aprovados**, em 1,3 minuto.
- `pnpm exec playwright test e2e/exam-request-idempotency.spec.ts --grep-invert 'formato-atual-sem' --output=test-results/regression --workers=2`: **77 aprovados**, em 3,6 minutos.
- Após integrar as alterações recentes da versão principal, preservando sua matriz ampliada de retorno à clínica: `pnpm exec playwright test e2e/exam-request-idempotency.spec.ts --grep 'formato-atual-sem|voltar à clínica em cache' --workers=2 --output=test-results/post-rebase`: **48 aprovados**, em 2,6 minutos. Inclui novamente os 24 casos desta entrega e os 24 cenários de retorno presentes no arquivo integrado.
- A suíte executou com um trabalhador por arquivo. Capturas de erro e recuperação geradas em `test-results/`, fora do Git; imagens representativas conferidas visualmente.
- Escopo da evidência: permanência dos dois erros específicos, falhas atrasadas 401/403/500/rede efetivamente processadas, observação transitória, recuperação em B sem consentimento herdado e zero POSTs nos 24 casos novos.
- Limitações: não certifica autorização real do servidor ou isolamento multiempresa completo. A captura pública do aplicativo carregou o shell; consultas reais retornaram 502 porque o servidor de API não estava iniciado. A jornada solicitada foi validada no navegador com a API integralmente simulada, sem depender desse servidor.
- Sem alteração de código de produção, banco ou contratos. Revisão de conclusão solicitada à plataforma; esta evidência não autoriza publicação.
