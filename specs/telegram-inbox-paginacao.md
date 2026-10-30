# Paginação do histórico Telegram

## Objetivo
Exibir inicialmente as vinte mensagens mais recentes e permitir consultar o histórico em lotes de vinte.

## Requisitos
1. A consulta aceita `pagina`, iniciando em um, e usa deslocamento conforme a quantidade selecionada (vinte por padrão).
2. A ordenação é determinística: data decrescente e identificador decrescente.
3. Todas as páginas verificam o cliente e a empresa da sessão antes de consultar mensagens.
4. O botão "Ver mais antigas" acrescenta o próximo lote sem duplicar mensagens.
5. Falhas mantêm o histórico disponível e permitem tentar novamente a mesma página.
6. A troca de cliente utiliza histórico independente; respostas atrasadas não misturam clientes.
7. A atualização periódica continua disponível depois de carregar mensagens antigas.
8. O envio bem-sucedido atualiza o histórico do cliente ao qual a mensagem foi enviada.

## Verificação
Testar primeira página, páginas seguintes, última página, página vazia, parâmetros inválidos,
autenticação e recusa de acesso entre empresas.
Verificar o carregamento, a ordenação, a ausência de duplicatas e os estados de erro na interface.

## Limites
Não alterar cálculos clínicos, pagamentos, agendamento nem destruir dados.
Correções necessárias de integração devem preservar as funcionalidades existentes.

## Ampliação solicitada: controles de histórico
1. Manter vinte como padrão e oferecer cinquenta ou cem mensagens por lote.
2. Filtrar no servidor por direção: todas, recebidas (`entrada`) ou enviadas (`saida`).
3. Colocar controles, contagem exibida e "Ver mais antigas" no rodapé do histórico.
4. Alterar quantidade ou direção reinicia a consulta na primeira página, sem reutilizar páginas incompatíveis.
5. Não carregar o histórico inteiro de uma vez nem inferir gravidade clínica a partir de texto.
6. Autorizar todas as leituras pela clínica vinculada ao colaborador no banco, sem confiar em empresa fornecida na requisição.

## Falhas previstas
| Falha | Barreira e recuperação | Teste |
|---|---|---|
| Resposta antiga após troca de cliente/filtro | Chave independente, cancelamento e descarte do cache sem observadores | Navegador |
| Erro ao buscar lote seguinte | Preservar conteúdo e tentar novamente a mesma página | Navegador |
| Quantidade ilimitada ou direção inválida | Quantidades permitidas e rejeição de parâmetros inválidos | Rota |
| Filtro aplicado apenas ao lote visível | Aplicar direção antes de LIMIT/OFFSET no servidor | Rota com consulta real simulada |
| Empresa forjada ou vínculo revogado | Resolver vínculo atual no servidor para cada chamada | Autorização |
