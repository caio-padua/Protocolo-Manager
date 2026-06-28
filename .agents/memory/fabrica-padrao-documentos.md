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

## Asset bundling no api-server (sempre roda do dist)
O `dev` do api-server é `build && start` — o servidor SEMPRE roda do bundle `dist`, nunca da fonte.
Logo, asset binário (PNG do wordmark, .afm) tem de ser COPIADO para `dist` no passo de build e
resolvido relativo ao próprio bundle, com fallback relativo à fonte só para teste avulso via `tsx`.
Esbuild NÃO empacota binário sozinho; `process.cwd()` adivinhado quebra.

**Why:** o asset some em runtime ("wordmark ausente") se ficar só na pasta de fonte; o erro só
aparece no PDF gerado, não no build.
