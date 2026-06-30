---
name: Banner de marca (e-mail/WhatsApp/Telegram) compõe arte oficial, não desenha
description: Por que o banner-imagem da marca tem de usar a arte 3D oficial em PNG e nunca redesenhar o símbolo/wordmark à mão
---

O banner-imagem da marca (PNG servido para WhatsApp MediaUrl, Telegram sendPhoto e cabeçalho de
e-mail) DEVE COMPOR as artes oficiais 3D (`paxter-symbol.png` = medalhão de vidro dourado;
`paxter-wordmark.png` = wordmark ouro 3D) sobre o fundo navy. NUNCA desenhar texto/símbolo "na mão"
com formas de canvas — isso sai chapado e fura o Padrão 14 da skill-layout-paxter (símbolo sempre no
medalhão de vidro 3D).

**Why:** o relevo/brilho 3D da marca no APP é CSS/SVG/animação (PaxterSymbolGlass, glint) e só roda
no navegador. Um e-mail/WhatsApp é uma IMAGEM ESTÁTICA — não roda CSS. O único jeito de levar o 3D
para a imagem é usar a ARTE RENDERIZADA OFICIAL (PNG), não recriar o efeito com retângulos/texto.
O CEO reprovou o banner chapado justamente por isso ("não está nada em 3D, está chapado").

**How to apply:** ao gerar qualquer imagem de marca server-side, carregar os PNGs oficiais
(loadImage) e compor; a geração vira assíncrona (propagar await ao chamador). Resolver o asset por
candidatos de caminho que cubram dev (src/assets) e produção (dist/assets — o build copia para lá).
Medalhão = clipe arredondado + borda dourada + verniz de vidro, igual ao cabeçalho do e-mail.
Antes de inventar visual de marca, ler skill-layout-paxter (Padrão 14, references/marca, relevo-3d-ouro).
