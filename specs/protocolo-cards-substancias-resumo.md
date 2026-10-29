# Cards de substâncias no protocolo premium

## Objetivo

Exibir as substâncias do protocolo em cards visuais individuais, em uma página-resumo logo após a capa.

## Requisitos exatos

1. Criar a seção `SUBSTÂNCIAS DO SEU PROTOCOLO` após a capa premium.
2. Renderizar cada substância em um card navy/dark, numa grade fixa de duas colunas.
3. Cada card deve mostrar um círculo colorido com a inicial, nome em ouro com 12 pontos, dose em marfim e uma descrição curta.
4. A descrição deve usar `description` (`whatIs` no cadastro) e ser truncada para aproximadamente 80 caracteres.
5. Quando a quantidade ultrapassar a capacidade de uma página, criar páginas-resumo adicionais sem cortar cards.
6. Não gerar imagens por inteligência artificial nem adicionar upload de imagem.

## Casos extremos

- Não criar página-resumo quando o protocolo não tiver substâncias.
- Usar um marcador curto quando dose ou descrição estiverem ausentes.
- Truncar nomes, doses e descrições longos dentro dos limites do card.
- Usar a cor padrão existente quando a substância não tiver uma cor reconhecida.

## Definição de pronto

- O PDF é gerado sem erro com zero, uma e muitas substâncias.
- A página-resumo contém a seção e os cards em duas colunas.
- Testes automatizados comprovam paginação e conteúdo/truncamento.
- A revisão separada confirma todos os requisitos sem pendências.

## Linhas vermelhas

- Não alterar as fichas clínicas individuais, cálculo, assinatura digital ou payload das rotas.
- Não disparar a rota real de geração, pois ela pode enviar e-mail e gravar no Google Drive.
- Não incluir imagens por inteligência artificial nem upload de imagem.