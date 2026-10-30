# Isolamento do histórico após revalidação de clínica

## Objetivo
Impedir que documentos e pendências da clínica anterior apareçam após revalidar o mesmo paciente e médico.

## Requisitos
1. Testar clinic.id e empresaId isoladamente e em conjunto em `e2e/exam-request-idempotency.spec.ts`.
2. Exibir histórico original, reter sua atualização, revalidar o contexto sem navegação e responder ao histórico novo antes do antigo.
3. Interceptar todas as chamadas `/api/**` com respostas sintéticas; nenhum POST é autorizado.
4. Verificar ausência de documentos e pendências antigos durante o carregamento e após a resposta atrasada, incluindo alterações transitórias do DOM.
5. Conferir ClinicalDraft, PedidosExamesPanel e ExamRequestHistoryPanel; corrigir somente o isolamento necessário.
6. Repetir as três transições após carregar a página de offset 20 com “Mais antigos” e reter a página de offset 40. O novo escopo deve consultar somente offset 0 e desabilitar “Mais recentes”.
7. Distinguir documentos e pendências das páginas 0, 20 e 40; nenhuma pode aparecer no novo escopo, nem temporariamente. Entregar a página 40 apenas depois de concluir o histórico novo, comprovando que seu corpo foi lido pelo navegador.

## Casos extremos
O mesmo paciente, médico e token não implicam a mesma clínica; remontar o editor não isola o cache compartilhado. Cancelamento de fetch não pode ser a única proteção testada.
Paginação mantém estado local e entradas de cache por offset: testar uma página antiga já carregada e outra ainda em trânsito evita confundir cancelamento com isolamento. Vazamento clínico é impeditivo; a barreira é a chave de cache por escopo junto da remontagem do editor, e a recuperação reinicia na página inicial sem enviar documentos.

## Pronto
Os seis cenários (atualização e paginação para cada transição) passam, assim como a suíte de idempotência existente, sem chamadas reais ou envios. A resposta antiga efetivamente chega ao navegador após a nova; os offsets são conferidos nas interceptações e o DOM é observado contra flashes.

## Linhas vermelhas
Não alterar motores clínicos, banco, autenticação, emissão ou envio. Não usar dados reais.

## Evidência de execução — 30/10/2026
- Comando: `pnpm exec playwright test e2e/exam-request-idempotency.spec.ts --workers=1`.
- Resultado: 44 testes aprovados, incluindo os seis cenários de isolamento por clínica/empresa.
- Ambiente: navegador Chromium contra o frontend local; todas as chamadas `/api/**` dos cenários são interceptadas com dados sintéticos.
- Conferência: offset local inicial zero; chave de consulta inclui escopo e offset; `ExamsEditor` remonta por `scope` e transmite esse escopo ao histórico. Não foi necessário alterar os componentes.
- Capturas: `historico-clinica-isolado.png` nos diretórios de cada cenário em `test-results/`; conferida a captura da transição simultânea com paginação.
- Dependência corrigida: removido marcador residual `||||||| base` preexistente no arquivo de testes, que impedia sua interpretação.
- Limites: não valida banco, provedores externos ou autorização real do servidor; nenhuma emissão ou envio real foi executado.
