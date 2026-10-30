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
### Retorno com falha da consulta atual
- Executar também 401 e 500 na **nova** consulta de A, offset 0, após A → B → A em cache, nas três transições e nos dois momentos de entrega da página antiga.
- Manter a resposta antiga bem-sucedida: ela não é a falha sob teste.
- Exigir erro atual explícito, sem estado vazio enganoso, sem documentos selecionáveis antigos, sem dados de B ou páginas 20/40, canais e consentimento vazios e envio desabilitado.
- Pendências da página inicial de A podem permanecer apenas como últimas informações conhecidas, com aviso de que não foram reconfirmadas; erro não prova falha do envio nem libera reservas.
- Manter interceptação sintética de toda `/api/**`, zero POSTs e captura do estado de erro. Conferir os dois painéis sem alterar produção salvo defeito impeditivo.

| Risco | Causa | Barreira / evidência |
| --- | --- | --- |
| Retomar paginação antiga | Estado local não reiniciado | Offsets registrados por etapa e “Mais recentes” desabilitado |
| Misturar clínicas no primeiro render | Cache sem escopo | Consulta de retorno retida e observador de mutações |
| Reaproveitar autorização | Editor não remonta | Preparar envio em A e B, exigir controles vazios no retorno |
| Resposta antiga alterar retorno | Consulta paginada ainda em trânsito | Liberar após retorno e contar JSON processado |
| Envio real | Interceptação incompleta | Bloqueio global de métodos diferentes de GET |

## Pronto
Dezoito combinações passam no Chromium (sucesso, 401 atual e 500 atual em cada transição e momento de entrega), e a suíte existente continua passando. Captura sintética do retorno disponível nos resultados do teste. Revisão independente pelo fluxo de conclusão.

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

### Ampliação — falha atual no retorno em cache — 30/10/2026
- `pnpm exec playwright test e2e/exam-request-idempotency.spec.ts --workers=2`: 77 aprovados, incluindo 12 novos casos de falha atual e as seis combinações de sucesso mantidas. O arquivo executa serialmente por sua configuração interna.
- Erros 401/500 pertencem exclusivamente à nova consulta offset 0 de A. A página antiga offset 40 é entregue com sucesso e seu corpo é comprovadamente processado.
- Em erro, a tabela de documentos não aparece; pendências iniciais são identificadas como últimas conhecidas, não reconfirmadas. Não aparecem B nem páginas 20/40; controles permanecem vazios e envio bloqueado.
- Captura sintética de 500 conferida visualmente; todos os cenários mantêm somente GETs e zero POSTs. Identidade, paciente e consultas usam exclusivamente respostas interceptadas.
- `ExamRequestHistoryPanel.tsx` e `PedidosExamesPanel.tsx` conferidos, sem necessidade de mudança. A captura independente da home não valida os dados: API deliberadamente parada, com respostas 502; os cenários-alvo foram verificados no navegador com API sintética.
- `git diff --check` sem erros. Nenhuma decisão nova ou lição não derivável do código exigiu alteração da memória.
