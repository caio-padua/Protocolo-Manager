# Histórico entre clínicas ao retomar aba inativa

## Objetivo
Estender a regressão A → B → A → B para comprovar isolamento na retomada da aba.

## Requisitos
1. Executar as seis combinações existentes de clínica, empresa e entrega atrasada.
2. Ocultar a aba na segunda visita a B com consultas de A e B ainda retidas; consumir respostas antigas sem cancelamento.
3. Avançar o relógio por 60 segundos ocultos e exigir nenhuma nova consulta.
4. Reexibir com a consulta atual pendente, sem duplicá-la; depois repetir ocultação/retomada com pendências clínicas carregadas para comprovar atualização automática.
5. Reter a resposta da retomada e conferir o cache atual, controles vazios, envio bloqueado e ausência de dados antigos, inclusive transitoriamente.
6. Liberar a resposta atual e avançar um intervalo de atualização; exigir somente offset zero atual, sem reativar consultas das visitas anteriores.
7. Interceptar `/api/**`, bloquear métodos diferentes de GET, exigir zero POSTs e uma única navegação.

## Falhas previstas
| Risco | Causa | Evidência |
| --- | --- | --- |
| Atualizar consultas antigas | Observadores mantidos após troca de escopo | Registro exato de offsets e marcadores por visita |
| Restaurar autorização | Estado reaproveitado na retomada | Observador de mutações e controles desmarcados |
| Atualizar em segundo plano | Visibilidade ignorada | Relógio controlado e contagem estável por 60 segundos |
| Falso isolamento por cancelamento | Resposta antiga nunca consumida | Contador de JSON com sinal de cancelamento removido |
| Enviar mensagem real | Interceptação incompleta | Bloqueio global, somente GET e zero POST |

## Pronto e limites
Seis cenários estendidos e regressões do arquivo e de atualização periódica passam no Chromium.
Captura sintética da retomada disponível nos resultados. Revisão pelo fluxo de conclusão.
Sem alterações de produção salvo defeito demonstrado, sem banco ou serviços externos.
A visibilidade é simulada via evento e propriedade do documento, não por suspensão real do processo do navegador.

## Evidência — 30/10/2026
- `pnpm exec playwright test e2e/exam-request-idempotency.spec.ts e2e/exam-request-history-polling.spec.ts --workers=2`: 80 aprovados, incluindo as seis combinações estendidas.
- Duas pausas de 60 segundos sem novas consultas; retomada com consulta em andamento sem duplicação; nova retomada e intervalo de 10 segundos consultando somente offset zero atual.
- Respostas antigas consumidas enquanto a aba está oculta, sem vazamento detectado pelo observador de mutações. Seleção, canais e consentimento vazios antes e depois das respostas atuais.
- Todas as chamadas dos seis cenários interceptadas: somente GET, zero POSTs, uma navegação.
- Captura `retomada-clinica-cache-segura.png` conferida: somente documento e pendência `B-retomada`, zero selecionados e envio desabilitado.
- Produção intacta. Nenhuma alteração de banco ou serviço externo. Nenhuma nova decisão durável para memória.
- Frontend iniciado normalmente; avisos preexistentes de propriedades duplicadas em outra tela. Captura independente da página inicial renderiza, mas retorna 502 nas consultas sem API em execução; não comprova integração real. A jornada alvo foi conferida no navegador com interceptação integral e dados sintéticos.
