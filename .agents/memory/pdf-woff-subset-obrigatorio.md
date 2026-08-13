---
name: Fonte .woff em PDF exige subset:true
description: Por que PDFs saíam ilegíveis (texto virando pontinhos) e como provar que a fonte está sã antes de entregar
---

# Fonte .woff embutida em PDF exige `{ subset: true }`

`pdfDoc.embedFont(bufferWoff)` **sem** `{ subset: true }` gera um PDF que abre
normalmente, tem tamanho plausível e responde HTTP 200 — mas cujo texto sai como
pontinhos/quadradinhos em qualquer leitor.

**Why:** o `.woff` é um formato comprimido para navegador. Sem recorte, o pdf-lib
embute o arquivo comprimido cru no PDF; nenhum leitor descomprime isso. Com
`subset: true`, o fontkit reescreve a fonte em TrueType puro contendo só os
glifos usados. Fonte padrão (`StandardFonts.Helvetica`) não tem esse problema —
só arquivos `.woff`/`.woff2` carregados do disco.

**How to apply:** todo `embedFont` que recebe buffer de arquivo leva
`{ subset: true }`. Vale para qualquer gerador novo de PDF do projeto.

## EXCECAO — fonte que e INSTANCIA de fonte variavel

Se o `.ttf`/`.woff` foi gerado instanciando uma fonte variavel (por exemplo com
`fontTools.varLib.instancer`), a regra **inverte**: `{ subset: true }` corrompe a
fonte e o PDF abre com metade das letras faltando. Comprovado em 13/08/2026 com o
EB Garamond, tanto em `.woff` quanto em `.ttf`.

Solucao: recortar a fonte ANTES, com `python3 -m fontTools.subset ... --unicodes=...`,
salvar em `.ttf` e embutir com `{ subset: false }`. Um mesmo gerador pode precisar das
duas regras ao mesmo tempo (Manrope com `true`, EB Garamond com `false`) — nao unificar.

Sintoma para reconhecer: o PDF nao da erro nenhum, o `pdffonts` mostra a fonte embutida,
mas na imagem renderizada aparecem letras soltas e espacos onde deveria haver texto.

## A prova que NUNCA pode ser pulada

HTTP 200 + tamanho do arquivo + log de envio **não provam nada** sobre a
aparência do documento. Um PDF com fonte quebrada passa nos três.

Sequência mínima antes de dizer que um PDF está pronto:

```
pdffonts arquivo.pdf     # coluna "emb" deve ser yes
pdftoppm -png -r 70 arquivo.pdf /tmp/pg   # NÃO pode imprimir "Syntax Error"
```

E então **abrir as imagens geradas e olhar**. Se `pdftoppm` reclama
`Embedded font file may be invalid`, o documento está quebrado para o cliente
final, por mais que a rota tenha respondido 200.
