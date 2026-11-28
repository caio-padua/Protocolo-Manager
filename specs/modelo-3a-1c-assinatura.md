# Modelo 3A-1C para prescrições e pedidos de exames

## Objetivo
Aplicar o quadro institucional aprovado de assinatura aos modelos de prescrição e de solicitação de exames, preservando as regras clínicas e a integridade da assinatura do documento.

## Requisitos
1. Quadro horizontal de 180 por 24,5 milímetros, centralizado na folha A4, com margem de 15 milímetros.
2. QR à esquerda, dados do certificado em duas colunas centrais e assinatura do profissional à direita, com as proporções, divisórias e cores da especificação fornecida.
3. Usar dados do certificado e do profissional autenticado; nunca usar valores fixos da imagem como dados reais.
4. O QR do quadro leva ao validador oficial, que requer o envio do documento pelo usuário; não afirmar validação automática ou autenticidade por apenas abrir a página. Manter, separadamente, os mecanismos de acesso à cópia de receita já existentes.
5. Na exceção de certificado vencido, não representar o documento como assinado e manter o bloqueio de compartilhamento.
6. Aplicar ao receituário simples, controlado e aos diferentes modelos de emissão ativos, além dos pedidos de exames.
7. Preservar regras de paginação, conteúdo, autenticação, isolamento entre clínicas, assinatura criptográfica e envio.
8. Fonte e tamanho priorizam a legibilidade, respeitando a especificação visual e declarando qualquer limitação.
9. Na receita, a faixa de assinatura fica em posição fixa na parte inferior da
   última página, acima do rodapé, mesmo quando o corpo for curto. Seu espaço
   não pode ser ocupado por fórmulas, detalhes ou caixas de receita especial.
   Quando não couber, iniciar outra página sem cortar ou esconder conteúdo.
10. Os campos obrigatórios de receita especial permanecem no corpo, acima da
    faixa. A classificação simples ou especial não escolhe outro cabeçalho
    nem outro rodapé.

## Impactos e falhas previstas
- Fonte de identidade incorreta: usar o contexto do profissional autenticado e o certificado validado, sem identificar médico por nome.
- Ausência de certificado ou rubrica: exibir estado real; não inventar dados ou afirmar assinatura inexistente.
- Colisão de textos longos, nomes ou séries: limitar a área de cada coluna e evitar sobreposição.
- Quadro cortado por quebra de página: reservar a altura total antes de desenhar.
- Assinatura invalidada: inserir o quadro antes da assinatura criptográfica e não alterar o arquivo depois.
- QR ilegível ou incorreto: verificar conteúdo e leitura do código gerado; impressão física não pode ser comprovada pelo ambiente.
- Outros modelos e formatos: revisar os geradores existentes; não alterar fluxos legados bloqueados nem reativar emissão insegura.
- O modelo de faixas anteriormente comprimia imagens longas em uma única folha, deformando o quadro e o conteúdo; gerar páginas A4 reais e impedir que fórmulas e o quadro sejam partidos entre páginas.
- Posição fixa: calcular a reserva a partir do limite superior do rodapé e da
  altura real do quadro. Testar receita curta, extensa e especial, com e sem
  paginação. Se caixas especiais forem altas, não colocá-las sobre a faixa.
  Preservar dados clínicos e manter a assinatura criptográfica como último passo.
- O motor que imprime a receita a partir de uma página web também precisa
  reservar espaço na folha e colocar o mesmo quadro na posição fixa antes de
  assinar. O espaço reservado deve impedir sobreposição em todas as páginas;
  a prévia em tela não deve perder o quadro. Testar o arquivo impresso final,
  não apenas o código da página web.

## Critérios de pronto
- Geradores aplicáveis produzem o quadro nas posições especificadas e os campos correspondem ao contexto de emissão.
- Testes sintéticos cobrem documentos assinados e não assinados, paginação, caracteres longos e funcionamento do QR.
- Conferência visual de receita e pedido de exames sintéticos; sem envio a clientes e sem uso de certificado real.
- Verificação de assinatura criptográfica depois da geração.
- Revisão independente e demais evidências obrigatórias são registradas ou a homologação permanece bloqueada.

## Evidências e estado
- Testes sintéticos: quatro grupos passaram; após a última mudança nas rotas, os dois grupos afetados passaram novamente, incluindo bloqueio de caminho inválido de imagem.
- Os testes verificam assinatura criptográfica com certificado fictício, leitura do QR nos arquivos renderizados, indicação de documento não assinado e preservação das fórmulas em uma receita longa do modelo com faixas.
- A compilação e a inicialização do servidor de desenvolvimento passaram; a verificação geral de tipos apresentou erros em outras partes do projeto.
- A receita e o pedido de exame de amostra foram conferidos visualmente. As amostras usam dados e certificado fictícios.
- Não foi realizada impressão física ou leitura do QR no papel. Não foi usado certificado clínico real nem houve envio aos clientes.
- A revisão independente obrigatória não foi realizada. Estado de homologação: BLOQUEADO até revisão independente e conferência física.
