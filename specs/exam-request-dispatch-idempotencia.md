# Envio único de pedidos de exames

## Objetivo
Impedir que repetição, recarga ou duas janelas reenviem os mesmos documentos pelos mesmos canais.

## Requisitos
1. Exigir chave de operação no contrato de envio; resolver autorização clínica antes de consultar qualquer operação.
2. Vincular a operação ao profissional autenticado, empresa, clínica, cliente, conjunto de documentos e conjunto de canais, sem depender da ordem ou de itens repetidos.
3. Reservar no PostgreSQL com unicidade de chave por escopo e de conteúdo por escopo, antes dos provedores. Uma chave diferente para o mesmo conteúdo também recupera a operação anterior.
4. Reutilização de chave com conteúdo diferente responde 409, sem mensagens. Repetição retorna a operação já persistida, inclusive durante execução concorrente.
5. Não liberar, expirar ou repetir automaticamente operações reservadas. Falhas de comunicação, resultado parcial ou falha de persistência exigem conferência. Preservar os registros de auditoria por canal.
6. A tela usa chave determinística por seleção, informa operação anterior/em andamento/pendente de conferência e permite consultar novamente sem reenviar. Recarregar ou trocar de janela não gera outra operação.
7. Migração exclusivamente aditiva no mecanismo pós-merge existente. Não tocar emissão de PDFs nem outros fluxos de mensagens.

## Casos extremos e pronto
Testes com provedores substituídos: concorrência, repetição, chave conflitante, chaves diferentes para mesmo conteúdo, conjuntos reordenados, timeout, auditoria indisponível, persistência final indisponível e isolamento entre profissionais/clínicas. Testar o controle da interface sem autenticação real nem mensagens reais. Build e inicialização dos serviços devem passar; a interface autenticada não terá acesso liberado para captura.

## Linhas vermelhas
Sem remoção de dados, sem alteração das regras de autorização, sem provedores reais nos testes, sem outros agentes. A revisão final é a do mecanismo de conclusão da tarefa.

## Limite de revisão após sincronização com o projeto principal
O projeto principal recebeu mudanças independentes em prescrições e rascunhos durante esta implementação. Elas devem ser preservadas, não revertidas por esta tarefa.

O comparativo correto da tarefa é `git diff main-repl/main...HEAD`. Ele contém apenas a reserva de envio de exames, a rota correspondente, o painel de histórico, contratos gerados, testes, migração e documentação. `git diff main-repl/main -- artifacts/api-server/src/lib/receituario-worker.ts` é vazio: a interrupção de `liberarSlot()` e mudanças no lote noturno de farmácias já pertencem à base recebida, não foram introduzidas aqui. O histórico desse arquivo também confirma que sua última alteração está na base, anterior a este trabalho. Não atribuir mudanças da base ao mecanismo de reserva nem reabrir fluxos suspensos fora deste escopo.

Verificação após a sincronização: 51 testes de servidor aprovados (incluindo 20 reservas concorrentes no PostgreSQL isolado), três testes de navegador aprovados com APIs simuladas, build/inicialização do servidor aprovados e saúde HTTP 200. Nenhum envio real nos testes. Checagens gerais de tipos têm erros preexistentes fora dos arquivos alterados; a checagem das bibliotecas passou.
