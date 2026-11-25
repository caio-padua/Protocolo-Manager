---
name: Troca do nome PAXTER por PAXMED na marca do topo
description: Como a palavra foi trocada sem tocar no motor de luz; arquivos novos paxmed-*; arte original preservada.
---
A palavra do topo (sidebar e telas públicas) usa arte PNG nova `paxmed-paxmed*` e `paxmed-headline*` em `padcom/src/assets/brand`, entregue pelos wrappers PaxterWordmarkArt e PaxterHeadlineArt. O motor de luz (PaxterRasterGlow), o símbolo e o subtítulo não foram alterados; arquivos `paxter-*` continuam no disco.
**Why:** o CEO exigiu raio de luz 100% igual; só a imagem muda. Arte fonte tem fundo preto: alfa por luminância, máscara limpa binarizada (fecha furos, remove faíscas) para a luz não vazar.
**How to apply:** para nova versão da arte, regerar escuro (alfa suave) e limpo (silhueta lisa), altura da palavra 144 px em tela 1019 px, subtítulo copiado do arquivo original.
