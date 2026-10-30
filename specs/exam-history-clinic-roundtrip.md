# Histórico de exames: retorno à clínica já armazenada

## Objetivo
Comprovar que A → B → A reinicia o histórico e a autorização sem misturar clínicas.

## Requisitos
1. Manter paciente, médico, sessão e URL; variar clínica, empresa e ambos separadamente.
2. Carregar A nos offsets 0 e 20, selecionar documentos/canais e autorizar sem enviar; reter offset 40.
3. Revalidar B, carregar seu histórico e preparar uma seleção com consentimento.
4. Voltar a A com sua página inicial já em cache, retendo a nova consulta de offset 0.
5. Exigir página inicial, seleções/canais/consentimento vazios e envio desabilitado, tanto durante a consulta retida quanto após sua resposta.
6. Entregar a página antiga de A enquanto B está aberta e, em cenário separado, depois da volta a A. Comprovar consumo do corpo mesmo sem cancelamento.
7. Observar o DOM antes de liberar cada identidade: nenhum dado de A em B; nenhum dado de B ou página antiga de A no retorno, nem transitoriamente.
8. Interceptar todas as chamadas `/api/**`, conferir somente GETs e zero POSTs; não acessar APIs reais.
9. Conferir cache por `historyScope` e remontagem do `ExamsEditor` por `scope`; alterar produção somente se houver defeito impeditivo.

## Falhas previstas
| Risco | Causa | Barreira / evidência |
| --- | --- | --- |
| Retomar paginação antiga | Estado local não reiniciado | Offsets registrados por etapa e “Mais recentes” desabilitado |
| Misturar clínicas no primeiro render | Cache sem escopo | Consulta de retorno retida e observador de mutações |
| Reaproveitar autorização | Editor não remonta | Preparar envio em A e B, exigir controles vazios no retorno |
| Resposta antiga alterar retorno | Consulta paginada ainda em trânsito | Liberar após retorno e contar JSON processado |
| Envio real | Interceptação incompleta | Bloqueio global de métodos diferentes de GET |

## Pronto
Seis combinações passam no Chromium e a suíte existente continua passando. Captura sintética do retorno disponível nos resultados do teste. Revisão independente pelo fluxo de conclusão.

## Linhas vermelhas
Sem banco, dados reais, provedores, envio, emissão ou mudanças de autenticação. A evidência é do frontend com respostas sintéticas, não da autorização real do servidor.

## Evidência — 30/10/2026
- `pnpm exec playwright test e2e/exam-request-idempotency.spec.ts --workers=2`: 56 testes aprovados, incluindo as seis combinações novas.
- Todas as interceptações dos cenários novos registraram somente GET; zero POSTs. Corpos antigos processados com cancelamento desativado.
- Cache existente confirmado visualmente antes da resposta retida do retorno: documento 91 e pendência inicial de A. Após atualização: documento 95, sem documentos 91/92/93/94.
- Captura `retorno-clinica-cache-seguro.png` em `test-results/` conferida: página inicial, zero seleções, canais e consentimento desmarcados, envio desabilitado.
- Componentes de produção conferidos e preservados: consulta inclui `historyScope`; `ExamsEditor` usa `key={scope}` e transmite o escopo ao histórico.
- Frontend iniciou normalmente. A captura independente da página inicial não comprova integração real: suas consultas retornam 502 com a API parada. A jornada alvo passou no navegador com respostas sintéticas.
- Sem aprendizado durável novo para a memória: esta entrega comprova o contrato já documentado, sem alterar decisões de arquitetura.
