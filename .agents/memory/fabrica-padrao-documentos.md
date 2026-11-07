---
name: Fábrica de Padrão de Documentos (PDF)
description: Camada única pdf-lib de cabeçalho/rodapé/marca; armadilhas de asset, de marca e de ordem PAdES.
---

# Fábrica de Padrão de Documentos

Camada única (motor pdf-lib) que padroniza cabeçalho-mastro, rodapé, cores e tipografia dos
documentos escritos. Os geradores consomem a Fábrica em vez de redesenhar à mão. NÃO cobre o RAS FAP
(pdfkit, grade própria copiada do IHE — linha vermelha).

## Marca no PDF: ouro-sobre-escuro é nativo, não force transparência
A arte oficial dos wordmarks (PAXTER e Instituto Pádua) é relevo DOURADO sobre fundo ESCURO embutido.
Remoção automática de fundo NÃO isola relevo dourado de textura escura (retorna "sucesso" mas o fundo
fica). Solução premium: desenhar uma FAIXA-MASTRO escura no cabeçalho e pousar o PNG sobre ela — o
fundo escuro do PNG funde com a faixa sem emenda. **Não gaste chamada de remoção de fundo em relevo.**

**Why:** a identidade da marca É ouro-sobre-escuro; lutar contra isso degrada a arte e perde tempo.

## Emissor governa marca E legenda do rodapé
Cabeçalho usa wordmark PAXTER por padrão. EXCEÇÃO: o receituário usa emissor "instituto_padua"
(asset próprio). O emissor do 1º cabeçalho também define a legenda padrão do rodapé (PAXTER vs
Instituto Pádua). Marca visível ao cliente = PAXTER; Instituto Pádua é exclusivo do receituário.

## Ordem PAdES: carimbar rodapé é separado de salvar
`carimbarRodape()` (idempotente) é separado de `finalizar()` (carimbar + `doc.save()`). No documento
assinado, o fluxo é: desenhar tudo → carimbar cabeçalho/rodapé → placeholder → assinar. NUNCA desenhar
nada depois de assinar (invalida o selo). Por isso o atalho `finalizar` (salva) só serve a documentos
NÃO assinados; o fluxo assinado chama `carimbarRodape` e entrega `fab.doc` ao assinador.

## Modelo 2B: emissor clínico separado do software

No Modelo 2B, o Instituto Pádua é o emissor no cabeçalho e a marca PAXMED no
rodapé identifica o software. A frase do rodapé desse modelo é “Medical
Intelligence System”. A identidade da clínica não deve ser aplicada a outras.

**Why:** o usuário forneceu um modelo específico de documentos para o Instituto,
distinguindo o emissor clínico do software que produz o documento.

**How to apply:** essa regra é específica do Modelo 2B; não altera os documentos
legados ou de outras clínicas automaticamente. Não presumir verificação por
código ou uso clínico antes de concluir e validar a integração.

## Identidade de clínica e acesso ao documento

O símbolo, o nome do cabeçalho e três linhas do rodapé são configurados no
Cadastro de Empresas. Cada empresa tem uma identidade compartilhada pelos seus
locais. O Instituto Pádua segue esse fluxo como exemplo de empresa licenciada.
O acesso ao documento aberto pelo código de verificação exige login.

**Why:** o responsável quer que futuras clínicas personalizem seus documentos
sem herdar a identidade do Instituto ou expor documentos a quem possuir o código.

**How to apply:** separar identidade empresarial e marca do software; vincular
configuração e leitura à empresa autorizada no servidor; não tornar o código,
sozinho, uma autorização para visualizar o arquivo.

No Modelo 2B, o símbolo e o nome são trocáveis por empresa, mas devem assumir
o dourado do modelo enviado pelo Dr. Claude. A forma do símbolo original deve
ser preservada; o tratamento visual não substitui nem apaga o original. O
responsável reforçou que a cor de entrada do símbolo pode ser branca, preta
ou colorida: a mesma forma deve receber o mesmo padrão dourado.

**Why:** o responsável definiu que a identidade é personalizável, mas a cor
do documento segue o mesmo padrão visual entre as clínicas.

**How to apply:** mostrar o resultado do tratamento antes de utilizá-lo; recusar
imagem inadequada em vez de apresentar o fundo como se fosse parte do símbolo.

## Asset bundling no api-server (sempre roda do dist)
O `dev` do api-server é `build && start` — o servidor SEMPRE roda do bundle `dist`, nunca da fonte.
Logo, asset binário (PNG do wordmark, .afm) tem de ser COPIADO para `dist` no passo de build e
resolvido relativo ao próprio bundle, com fallback relativo à fonte só para teste avulso via `tsx`.
Esbuild NÃO empacota binário sozinho; `process.cwd()` adivinhado quebra.

**Why:** o asset some em runtime ("wordmark ausente") se ficar só na pasta de fonte; o erro só
aparece no PDF gerado, não no build.
