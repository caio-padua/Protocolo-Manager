# Autorização de envio isolada por paciente e profissional

## Objetivo
Comprovar, antes de qualquer envio, que a autorização e os documentos selecionados não atravessam a troca de paciente ou sessão profissional.

## Requisitos
1. Acrescentar os cenários em `e2e/exam-request-idempotency.spec.ts`, usando somente respostas sintéticas para todas as chamadas `/api/**`.
2. Selecionar documentos e canais e autorizar no contexto original, sem clicar em Confirmar envio.
3. Trocar paciente e, em cenário separado, sessão profissional, sem recarregar a página.
4. No novo contexto, verificar documentos, canais e autorização desmarcados, contagem zerada e Confirmar envio desabilitado.
5. Exigir nova seleção de documentos, canais e confirmação válida para habilitar o botão. Alterar documentos ou canais deve invalidar uma autorização anterior.
6. Voltar ao contexto original e comprovar que sua autorização não é restaurada do cache.
7. Contabilizar todos os POSTs e exigir zero durante todo o cenário.

## Casos extremos
- Mesmo paciente e mesmos documentos disponíveis para outro médico.
- Retorno ao contexto anterior com histórico em cache.
- Confirmação marcada sem documentos ou canais não habilita o envio.

## Pronto
Os novos testes e os testes existentes do arquivo passam no navegador com todas as chamadas interceptadas. Não alterar motores de envio, dados reais ou provedores.
