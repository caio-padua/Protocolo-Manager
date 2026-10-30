# Isolamento do histórico após revalidação de clínica

## Objetivo
Impedir que documentos e pendências da clínica anterior apareçam após revalidar o mesmo paciente e médico.

## Requisitos
1. Testar clinic.id e empresaId isoladamente e em conjunto em `e2e/exam-request-idempotency.spec.ts`.
2. Exibir histórico original, reter sua atualização, revalidar o contexto sem navegação e responder ao histórico novo antes do antigo.
3. Interceptar todas as chamadas `/api/**` com respostas sintéticas; nenhum POST é autorizado.
4. Verificar ausência de documentos e pendências antigos durante o carregamento e após a resposta atrasada, incluindo alterações transitórias do DOM.
5. Conferir ClinicalDraft, PedidosExamesPanel e ExamRequestHistoryPanel; corrigir somente o isolamento necessário.

## Casos extremos
O mesmo paciente, médico e token não implicam a mesma clínica; remontar o editor não isola o cache compartilhado. Cancelamento de fetch não pode ser a única proteção testada.

## Pronto
Os três cenários passam, assim como a suíte de idempotência existente, sem chamadas reais ou envios. A resposta antiga efetivamente chega ao navegador após a nova.

## Linhas vermelhas
Não alterar motores clínicos, banco, autenticação, emissão ou envio. Não usar dados reais.
