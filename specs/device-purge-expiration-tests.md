# Limpeza de códigos e sessões: preservação da validade

## Objetivo e escopo
Comprovar que as funções reais de limpeza em `device-throttle.ts` removem
somente registros cujo `expires_at` é estritamente anterior a `NOW()`.
Somente testes aditivos: não alterar regras, rotas, telas, esquema ou cron.

## Requisitos e pronto
1. Código de uso único emitido há 5 minutos e válido por mais 5 minutos permanece.
2. Código vencido há 1 segundo é removido.
3. Sessões verificadas de 90 dias seguem a mesma regra: sessão recém-criada e
   sessão próxima do vencimento permanecem; sessão vencida há 1 segundo é removida.
4. Para ambas as tabelas, validade exatamente igual a `NOW()` permanece,
   respeitando o operador estrito `<`.
5. Conferir as linhas restantes e a contagem retornada; uma segunda limpeza
   retorna zero sem remover as linhas preservadas.
6. Executar também os testes existentes de verificação da biblioteca e rota.

## Impacto e falhas previstas
- Persistência: somente duas tabelas criadas pelo bootstrap real em PostgreSQL
  descartável, sem conexão ao banco configurado da aplicação.
- Falha de regressão: comparação invertida, ausência de filtro, uso do horário
  de emissão em vez da expiração ou uso de `<=` causariam perda indevida.
- Barreira: dados mistos, leitura posterior e relógio transacional fixo do
  PostgreSQL. Sem esperas ou relógio simulado em JavaScript.
- Sem efeitos externos, dados pessoais, mudança de autorização ou isolamento
  de clínicas: teste de manutenção global das tabelas já existentes.
- Visual e reinício da aplicação não se aplicam: nenhum código executado pelo
  servidor ou tela será alterado.

## Evidência
Comando: `pnpm --filter @workspace/api-server exec vitest run src/tests/verify-device-lib.test.ts src/tests/verify-device-route.test.ts src/tests/verify-device-purge-postgres.test.ts --maxWorkers=1`.

Resultado executado: 3 arquivos aprovados, 30 testes aprovados, incluindo os
2 novos testes de integração com PostgreSQL real descartável. Confirmadas
contagem de exclusões, linhas preservadas, igualdade no limite e repetição sem
novas exclusões. `git diff --check` sem erros. Não foi necessário alterar a
implementação: ambos os filtros existentes já obedecem a `expires_at < NOW()`.
