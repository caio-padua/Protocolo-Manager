# Seleção de pedidos recém-gerados por contexto

## Objetivo
Comprovar que a seleção automática de PDFs gerados não restaura autorização de envio ao trocar paciente ou sessão profissional.

## Requisitos
1. Estender `e2e/exam-request-idempotency.spec.ts` usando o editor real `PedidosExamesPanel`, catálogo sintético e resposta simulada de `/api/exam-requests/emit`.
2. Gerar dois PDFs pela interface e comprovar que aparecem automaticamente selecionados no histórico.
3. Marcar canais e consentimento, comprovar que o botão fica habilitado, mas nunca clicar em enviar.
4. Trocar paciente ou profissional sem recarregar; no novo contexto, documentos, canais e consentimento começam desmarcados e envio desabilitado.
5. Gerar e autorizar também no segundo contexto. Voltar ao primeiro e depois ao segundo sem recuperar seleção automática ou consentimento, mesmo com os PDFs preservados no histórico.
6. Interceptar todas as chamadas `/api/**`, validar emissão sem envio e exigir zero POSTs de envio ou outros POSTs inesperados.

## Casos extremos
- Histórico em cache ao retornar ao contexto anterior.
- Mesmo paciente com sessão de outro profissional.
- PDFs continuam disponíveis no histórico, mas sua presença não autoriza envio.

## Pronto
Dois novos cenários e toda a suíte de idempotência passam no Chromium, com uma única navegação de documento por cenário e capturas do painel.

## Linhas vermelhas
Sem API real, credenciais reais, geração real de PDFs ou mensagens. Não mudar motores, persistência ou layout; só corrigir componentes se os novos testes demonstrarem falha.
