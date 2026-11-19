# Padrao "Previa de Link Paxter" (aprovado pelo Dr. Caio em 18/11/2026)

Vale para QUALQUER link compartilhado (WhatsApp, Telegram): o cartao da previa (imagem og:image) segue este modelo.

## Arquivos de referencia (nesta pasta)
1. previa-de-link/referencia-paxmed-v11.jpg = imagem aprovada (1200 x 630).
2. previa-de-link/PaxmedLinkReceituario.tsx.txt = componente (copiar sem o .txt).
3. previa-de-link/paxmed-link-receituario.css.txt = estilos (copiar sem o .txt).
4. Original vivo: artifacts/mockup-sandbox/src/components/mockups/paxmed-link/ (canvas: /__mockup/preview/paxmed-link/PaxmedLinkReceituario).

## Regras do desenho
1. Imagem 1200 x 630, tudo centralizado; tecido risca de giz visivel nos 4 lados (paineis NAO ocupam o cartao inteiro). Pilha central de 800 px.
2. PLACA em cima (up bevel alto): azul-marinho escuro #14264a para #091428, 208 px de altura, topo iluminado, base grossa em degraus, sombra longa.
3. Dentro da placa: simbolo oficial PX (148 px) a esquerda e nome da marca (380 px) a direita; espaco de 44 px; SEM fio vertical; SEM moldura escura; tagline "CLINICAL INTELLIGENCE SYSTEM" (Jost, caixa alta, espacada, dourado claro) logo abaixo do nome.
4. GAVETA por baixo da placa (mesmo relevo alto): azul-marinho UM tom mais claro #16294f para #1a3160 (harmonico, sem contraste forte).
5. Texto da gaveta, centralizado: titulo EB Garamond 38 px (trecho final em italico dourado #e3b659); subtitulo Jost 17 px com losangos dourados (sem numeracao); frase de apoio 24 px; botao dourado. Espacos entre linhas 26 / 28 / 38 px: nunca amontoar.
6. Marca = arte oficial em PNG (nunca redesenhar, nunca esticar). Raio de luz so dentro do ouro (mascara), ciclo de 7 s; ?static=1 congela o raio para exportar.

## Como gerar e publicar uma previa nova
1. Trocar textos/arte no componente (nova marca = novos PNG de simbolo e nome oficiais).
2. Abrir o componente com ?static=1 em 1200 x 630 e salvar JPG (qualidade 92).
3. Gravar em artifacts/padcom/public/ com NOME NOVO: og-<marca>-vN.jpg (WhatsApp guarda cache por nome e por endereco).
4. Trocar o nome em og:image e twitter:image do index.html (endereco ABSOLUTO via __SITE_URL__; plugin "paxmed-og-site-url" do vite.config.ts).
5. Subir PREVIA_VERSAO em artifacts/padcom/src/pages/comunicacao/guia-paciente.tsx (os links gerados terminam com ?v=N).
6. Testar colando o link no proprio chat; NUNCA usar envio automatico a clientes.
7. Apos publicar, apontar VITE_SITE_URL para o endereco oficial (hoje a imagem vem do endereco de desenvolvimento).
