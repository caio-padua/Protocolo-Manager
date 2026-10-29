# Verificação da página extra de assinatura

## Reprodução automatizada

```sh
pnpm --filter @workspace/api-server exec vitest run src/tests/dieta-pdf-pagination.test.ts
```

O teste chama `gerarDietaPdf` com dados fictícios e simula apenas a resposta
da IA. O PDF é realmente renderizado, salvo, reaberto com `pdf-lib` e lido
com `pdf-parse`. Não há chamada à IA, acesso ao banco ou envio de mensagens.

- Controle: uma refeição e um suplemento geram quatro páginas; a assinatura
  fica na página de suplementação e todos os rodapés declaram quatro páginas.
- Overflow: uma refeição, dezesseis suplementos e sete itens em cada coluna
  do guia de escolhas geram cinco páginas. A assinatura e a identificação do
  profissional ficam na quinta página, não na quarta.
- A página extra declara `Pag. 5 de 5`. Todos os números são positivos,
  sequenciais e menores ou iguais ao total declarado na respectiva página.

## Resultado e limitação confirmada

A numeração fica no **rodapé**, embora seja escrita por `drawPageHeader`.
No caso de overflow, os totais extraídos são **[4, 4, 4, 4, 5]**.
Portanto, a página extra tem numeração válida, mas o total do documento
**não é consistente entre as páginas**. Esse comportamento não é considerado
correto; o teste o caracteriza explicitamente para registrar a constatação.

A correção deve finalizar a paginação somente depois que todas as páginas
existirem (ou calcular o layout antes de desenhar os rodapés). Ao corrigir,
trocar a expectativa dos totais por cinco em todas as páginas, preservando
as verificações de existência e localização do bloco de assinatura.

Esta verificação cobre o bloco textual com linha de assinatura, sem imagem.
Não altera o gerador nem verifica assinatura digital criptográfica.
