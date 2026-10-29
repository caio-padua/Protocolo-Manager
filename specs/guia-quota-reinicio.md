# Guia Digital — quota diária após reinício

## Objetivo
Confirmar que três envios bem-sucedidos por cliente e canal esgotam a quota diária mesmo quando o servidor perde seu estado em memória.

## Requisitos
1. Exercitar a rota real `/api/onboarding/enviar-guia` e seu SQL real contra PostgreSQL, sem enviar mensagens externas.
2. Encerrar o servidor HTTP de teste e recarregar o módulo da rota entre tentativas, descartando o Map de cooldown sem alterar a quota no banco.
3. Após três sucessos, exigir HTTP 429 com `motivo="limite_diario"` e o canal correto; nenhuma quarta chamada ao provedor.
4. Cobrir WhatsApp e Telegram, incluindo a independência entre canais.
5. No navegador, exigir o banner vermelho “Limite diário atingido”, sem o banner âmbar de cooldown; verificar também o caso de cooldown como controle.

## Segurança e casos extremos
- Usar cliente sintético e tabela temporária PostgreSQL restrita à conexão do teste. Não alterar cadastros, quotas ou histórico reais.
- Substituir somente provedores externos e leitura do cliente; executar o UPSERT de quota real.
- Suprimir as migrações de boot no teste para não tocar tabelas permanentes.
- Confirmar que falha do provedor libera a reserva e não esgota a quota diária.
- O reinício testado é do servidor HTTP e módulo da rota; não reinicia PostgreSQL nem o processo do runner.

## Pronto
Testes de integração e de navegador passando, com evidência visual do banner. A implementação atual usa `onboarding_quota` como contador persistente; `onboarding_envios` não controla a quota.

## Linhas vermelhas
Nenhum envio real, exclusão de dado real, alteração de schema permanente ou mudança de regras de negócio.
