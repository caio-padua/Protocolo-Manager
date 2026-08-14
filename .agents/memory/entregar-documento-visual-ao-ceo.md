---
name: Como entregar um documento para o CEO CONFERIR
description: Formatos que falham ao apresentar documento no chat e no app; PNG por página é o único caminho garantido
---

Para o CEO **ver** um documento gerado (PDF de paciente, carta, laudo), entregar **uma imagem PNG
por página**. Só isso abre sem depender de leitor.

O que falha, já medido duas vezes:

1. **PDF assinado digitalmente** apresentado no chat — o cartão abre em branco. O selo PAdES
   (segundo bloco colado no fim do arquivo) não é entendido pelo visualizador do chat. O arquivo
   está íntegro; quem não lê é o visualizador.
2. **HTML** apresentado no chat — o clique abre o **código-fonte no editor** do workspace, não a
   página renderizada. Servir HTML só funciona por um servidor rodando, nunca como arquivo
   apresentado.

**Why:** o CEO clicou e não viu nada duas vezes seguidas; na segunda ele exigiu solução definitiva.
Perder a confiança dele numa entrega custa mais que os segundos de gerar as imagens.

**How to apply:** `pdftoppm -png -r 120 arquivo.pdf saida/pagina` e apresentar cada PNG com título
"Página NN de MM — o que tem nela". Dentro do app, botão que gera documento deve **abrir em aba
nova** (`window.open` da object URL, revogando só depois de ~60 s), com download apenas como
fallback de pop-up bloqueado: botão que baixa não é botão que mostra.
