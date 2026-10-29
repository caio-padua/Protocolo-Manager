# Eventos do Guia Digital por clínica

## Objetivo
Registrar aberturas do guia na clínica indicada pelo slug, sem confiar em ID enviado pelo navegador.

## Requisitos
1. O guia lê `?tenant=` e envia `tenantSlug` ao registrar eventos.
2. O servidor resolve `tenantSlug` em `empresas.slug`; aceita `tenant` como alias legado.
3. Slug informado mas inexistente não gera evento na empresa 5. Slug vazio ou conflitante é inválido.
4. Sem slug, preservar o comportamento legado da empresa 5. Ignorar `empresa_id` do body.
5. Associar `client_id` somente se pertencer à empresa resolvida.
6. Todas as agregações de `/stats` usam a empresa do contexto autenticado, nunca body/query. Sem contexto válido, negar leitura em vez de usar empresa 5.

## Casos extremos e pronto
Testar a rota real com banco simulado: slug válido/desconhecido/vazio, alias legado, conflito, ausência de slug, ID forjado, paciente de outra empresa, falha de banco e estatísticas para duas empresas.
Conferir que o guia continua renderizando e envia o contrato atualizado.

## Limites
Não alterar dados históricos, schema, envio de mensagens ou autenticação global.
O contexto global atual ainda é single-tenant (empresa 5); sua evolução é trabalho separado.
