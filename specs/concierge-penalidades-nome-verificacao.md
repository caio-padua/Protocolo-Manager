# Verificação do nome nas penalidades

## Objetivo
Confirmar a identificação do paciente na tabela existente, sem mudar as regras de penalidade.

## Requisitos
1. Selecionar um cliente existente, não excluído, da empresa 5 com CPF de 11 dígitos.
2. Registrar uma falha por `registrarFalha()` e consultar `listPenalidades()`, com e sem filtro.
3. Conferir no navegador o CPF mascarado e o nome abaixo dele na mesma célula.
4. Registrar uma falha para CPF sem cliente correspondente e conferir `nome_paciente: null` e “—” na tela.
5. Reverter integralmente os dados de teste, mesmo se a verificação falhar.

## Casos extremos e linhas vermelhas
- Não inventar um nome para CPF desconhecido.
- Não escrever em produção, enviar mensagens ou deixar penalidades ativas.
- Não remover registros existentes: usar uma transação revertida.
- Não publicar dados pessoais em logs ou capturas versionadas.
- A autenticação simulada existe somente no navegador do teste; não alterar a aplicação.

## Pronto
Teste opt-in executado contra PostgreSQL e tela real; verificações de nome, máscara,
posição vertical e ausência de correspondência aprovadas; rollback confirmado.

## Resultado da execução — 29/10/2026
- Aprovado: chamada real de `registrarFalha()` no PostgreSQL para um cliente existente e um CPF sintético sem correspondência.
- Aprovado: `listPenalidades()` com e sem filtro, incluindo o nome real e o retorno nulo.
- Aprovado no Chromium: nome e “—” visíveis, abaixo da máscara, na mesma célula.
- Aprovado: registros de penalidade idênticos antes e depois do rollback.
- Os dados retornados pelo motor foram entregues à tela por interceptação de rede
  somente no teste, pois a transação não confirmada não é visível à conexão HTTP
  do servidor. Outros endpoints e autenticação foram simulados nesse navegador.
  Não é uma verificação HTTP ponta a ponta da rota administrativa.
- Os 48 testes existentes das duas suítes de penalidades também passaram.

Execução (com PADCOM iniciado):

```sh
RUN_CONCIERGE_NAME_INTEGRATION=1 pnpm --filter @workspace/api-server exec vitest run src/tests/concierge-penalidade-nome.integration.test.ts
```

Sem a variável opt-in, o teste de integração é ignorado pela suíte padrão.
Nenhum nome, CPF real ou captura de paciente foi gravado como evidência.
