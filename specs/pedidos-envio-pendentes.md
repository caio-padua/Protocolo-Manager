# Pedidos com envio pendente de conferência

## Objetivo
Exibir no histórico do cliente reservas sem conclusão, sem reconstruir a seleção do envio.

## Requisitos
1. Consultar operações `in_progress` e `needs_review` após autenticação e autorização clínica; restringir médico, empresa, clínica e cliente.
2. Mostrar identificação, data BRT, documentos, canais e resultados parciais disponíveis, com aviso de que o envio pode estar em andamento ou ter sido interrompido.
3. Persistir cliente, documentos e canais atomicamente na reserva. Para reservas anteriores, usar somente auditoria vinculada à operação e ao mesmo escopo autorizado; não adivinhar vínculo a partir de hash.
4. Aviso independente da seleção e da página de documentos; atualização pelo histórico e ao retornar à janela.
5. GET somente leitura: nunca liberar, expirar, reenviar nem alterar reservas. Não afirmar entrega nem falha por ausência de resultado.

## Casos extremos
- Reserva sem qualquer auditoria; resultado parcial; reserva antiga; outro médico ou clínica; muitos documentos no histórico; erro na consulta.
- Reserva antiga sem metadados nem auditoria não permite identificar paciente com segurança e não será exposta.

## Pronto
- Contrato e tipos gerados atualizados.
- Testes de consulta com PostgreSQL isolado cobrem autorização, isolamento, reservas sem auditoria, resultados parciais e ausência de efeitos colaterais.
- Teste de interface comprova aviso após recarga sem seleção e em página antiga, sem POST automático.
- Build e inicialização conferidos; captura pública sem contornar autenticação.

## Linhas vermelhas
Somente migração aditiva. Preservar proteção contra duplicação e histórico. Nenhum contato real com provedores nos testes.
