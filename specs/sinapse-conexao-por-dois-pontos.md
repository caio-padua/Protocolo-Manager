# Conectar sinapses clínicas por dois pontos

## Objetivo

Permitir ligar uma pergunta da anamnese a uma saída clínica com dois cliques nos pontos visíveis, acompanhando o caminho do fio antes de gravar.

## Requisitos

1. A interação de conexão existe somente no modo “Edição”.
2. O primeiro clique no ponto da pergunta inicia um fio temporário ancorado naquele ponto.
3. Depois que o primeiro clique termina, o fio continua acompanhando o ponteiro até a saída.
4. O clique no ponto de uma saída completa a ligação e chama a rota autenticada já existente para gravar a ligação ativa.
5. O fio só vira condução ativa depois da resposta bem-sucedida do servidor.
6. Após salvar, atualizar os dados da tela, selecionar a pergunta ligada e destacar o fio recém-criado; o brilho inicial é breve, e o fio continua visível como ligação selecionada.
7. A tecla Escape cancela o fio em andamento; iniciar por outro ponto de pergunta troca a origem.
8. Soltar o ponteiro fora de uma saída não apaga o fio temporário nem grava uma ligação.
9. Preservar o arraste atual para conectar e a cópia por arraste com Alt.
10. Saídas vazias, inativas ou ausentes não recebem ponto de conexão e não podem ser gravadas.
11. Erros de autenticação, duplicidade, rede ou servidor são mostrados; nenhum deles deve produzir brilho de sucesso nem desenhar uma ligação ativa.
12. Os pontos mantêm rótulos acessíveis e são utilizáveis por teclado; no celular, os alvos de toque têm pelo menos 40 pixels.
13. Respeitar `prefers-reduced-motion`: sem animação quando a pessoa tiver solicitado movimento reduzido.

## Falhas previstas e barreiras

| Falha | Comportamento exigido |
|---|---|
| Soltar o primeiro clique | Manter o fio temporário preso à pergunta |
| Clicar fora do destino | Não gravar; manter o modo de conexão até outra ação ou Escape |
| Clicar numa saída vazia | Não iniciar nem completar ligação |
| Tentar criar ligação repetida | Mostrar a recusa real do servidor; não simular sucesso |
| Sessão ausente ou sem permissão | Mostrar erro; não alterar o catálogo nem o estado visual |
| Resposta de gravação perdida | Não repetir automaticamente; atualizar a tela para conferir o estado persistido |
| Alternar para Visualização ou Simulação | Cancelar o fio temporário |
| Movimento reduzido habilitado | Mostrar o estado concluído sem animação |
| Teclado ou toque | Manter início, conclusão, cancelamento e foco acessíveis |

## Impacto

- Mudança restrita à interação da tela de Sinapses Clínicas.
- Reutiliza a gravação autenticada e as tabelas atuais de ligações.
- Não altera as propostas pendentes, o motor clínico, o Cockpit nem os catálogos.

## Definição de pronto

1. No modo Edição, clicar no ponto de uma pergunta inicia e mantém o fio seguindo o ponteiro.
2. Clicar no ponto de uma saída completa e grava uma única ligação ativa.
3. Após a gravação, o fio recebe um brilho breve e permanece selecionado na tela.
4. Escape cancela sem gravar; trocar para outro modo também cancela.
5. Arraste para conectar e Alt+arraste para copiar continuam funcionando.
6. Saída inválida e erro de gravação não produzem ligação nem brilho de sucesso.
7. A tela permanece utilizável em computador e celular, inclusive por teclado e com movimento reduzido.
