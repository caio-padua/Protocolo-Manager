# Pedidos de exames em lote e historico no Cockpit

## Objetivo
Concluir primeiro a jornada de pedidos de exames do cliente ativo, sem criar outro Cockpit ou emitir documentos reais em testes.

## Requisitos
1. Recuperar o servidor de desenvolvimento sem criar outro processo concorrente.
2. Reutilizar catalogo e resolvedor de identidade existentes, sem cadastrar exames por suposicao.
3. Filtrar exames cardiologicos por nome/grupo/modalidade, mantendo busca e selecao individual por caixinhas.
4. Permitir gerar um pedido por exame em uma acao ou manter agrupamento por tipo.
5. Na interface nova, gerar documentos SEM enviar mensagens.
6. Enviar somente depois de confirmar arquivos e canais: e-mail, WhatsApp, Telegram ou combinacoes.
7. Conferir no servidor medico, cliente, clinica, documentos e destinos antes de qualquer envio.
8. Registrar pedidos e tentativas/resultados dos envios; reutilizar a auditoria existente sem dados clinicos nos logs.
9. Consultar historico paginado do cliente e abrir o documento preservado; erros nao significam historico vazio.
10. Impedir respostas atrasadas de outro cliente de preencherem a tela e bloquear novas acoes enquanto houver operacao pendente.
11. Atualizar carta para revisao independente e sincronizar GitHub sem force-push.

## Limites
Nao homologar assinatura digital nem presumir que os outros documentos clinicos estao prontos.
Nao duplicar a tarefa de assinatura ja em execucao.
Nao enviar mensagens reais ou gerar documentos clinicos de clientes reais durante testes.
Nao tocar calculo de orcamentos ou desmembramento de receitas.
Nao substituir banco, apagar registros ou mudar armazenamento dos arquivos existentes nesta entrega.

## Verificacao
Testes isolados de autorizacao, agrupamento, destinos, envio explicito e historico.
Compilacao e inicio do servidor; respostas anonimas 401 nas novas rotas.
Conferencia visual do estado sem acesso; demonstracao autenticada depende de sessao autorizada.
Testes simulados nao substituem homologacao clinica supervisionada.
