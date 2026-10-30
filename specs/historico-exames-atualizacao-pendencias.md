# Atualização de pendências no histórico de exames

## Objetivo
Refletir conclusões registradas em outra janela sem exigir atualização manual.

## Requisitos
1. Consultar somente o GET de histórico a cada 10 segundos enquanto a consulta tiver pendências, o painel estiver habilitado e a aba estiver visível.
2. Parar ao receber lista vazia, desabilitar/desmontar o painel ou ocultar a aba. Retomar a consulta ao voltar à aba; preservar atualização manual e por foco.
3. Usar o ciclo da consulta existente, sem temporizadores de envio nem consultas sobrepostas.
4. Em erro, mostrar aviso explícito de atualização indisponível e manter as últimas pendências conhecidas como dados não reconfirmados. Continuar tentando enquanto elas existirem.
5. Não modificar seleção, autorização, envio, reservas ou estado de operações. Nenhum POST automático; tempo decorrido não prova falha nem autoriza repetição.

## Casos extremos
Resposta malformada, erro temporário com cache, ausência de pendências, troca de painel e aba oculta. A consulta inicial sem dados que falhar continua dependendo dos caminhos existentes de recuperação manual/por foco.

## Pronto
Testes de navegador com respostas controladas demonstram conclusão sem clique, parada sem pendências, saída do painel, aba oculta, erro e recuperação; nenhuma escrita ou envio real é executado. Revisão de conclusão pelo fluxo da tarefa.
