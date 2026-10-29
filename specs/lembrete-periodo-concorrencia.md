# Concorrência limitada dos lembretes

## Objetivo
Evitar que os envios sequenciais consumam a tolerância de cinco minutos.

## Requisitos
1. `executarLembretesPeriodo` aceita `concorrencia`, inteiro positivo, padrão 10.
2. Processar lotes de até esse limite com `Promise.allSettled`, aguardando todos
   antes do próximo lote. Valores inválidos falham antes de consultar o banco.
3. Preservar janela BRT, claim único antes de enviar, templates, voz best-effort,
   contadores e estados de entrega. Falhas do WhatsApp continuam individuais.
4. Erros inesperados de banco/processamento não impedem outros clientes de serem
   tentados, mas são registrados e propagados ao chamador ao final do tick.

## Casos extremos
Lista vazia, limite 1, lote final incompleto, limite inválido, cliente sem telefone,
janela não elegível, claim duplicado, falha/rejeição do provedor e ticks sobrepostos.

## Pronto
Testes isolados com relógio simulado comprovam 10 envios de 5 segundos em 5 segundos
e 50 em 25 segundos, limite configurável, idempotência e isolamento de falhas.
Nenhuma mensagem real é enviada nos testes.

## Linhas vermelhas
Sem alterações de schema, dados clínicos, regras de horário ou conteúdo das mensagens.
