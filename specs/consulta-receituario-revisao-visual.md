# Spec — Revisao visual geral da pagina publica /consulta-receituario

Data: 26/07/2026. Pedido do CEO Dr. Caio (Paxter Loop).

## Objetivo (uma frase)

Igualar TODOS os paineis da pagina de validacao de receituario entre tema claro e tema escuro
(alturas, marca, posicoes, relevo 3D), e corrigir frases, nomes e subtitulos, incluindo o
credito oficial da PADCON Platform no rodape.

## Requisitos exatos

1. CABECALHO (painel superior sticky):
   1.1. Mesma ALTURA nos dois temas (altura fixa, nao dependente do conteudo).
   1.2. Wordmark PADAXOR = MESMO ativo grafico nos dois temas: `public/brand/padaxor-wordmark-nobg.png`
        (PNG transparente oficial), altura fixa, sem filtro, sem mix-blend-mode (regra Dr. Claude 26/07/2026).
   1.3. Componente CSS `PadaxorWordmark` (texto Cinzel) DEIXA de ser usado no cabecalho
        (viola a regra "wordmark e ativo grafico fechado, nunca texto digitado").
   1.4. Simbolo PaxterSymbolGlass no MESMO lugar e tamanho nos dois temas; so muda `tone`.
   1.5. Subtitulos identicos nos dois temas em posicao e tamanho; so muda a cor.
2. RODAPE (painel inferior sticky) — REVISADO pelo CEO em 26/07/2026:
   2.1. Mesma ALTURA nos dois temas, e faixa ESTREITA (52px).
   2.2. Conteudo = APENAS a referencia do PADCON: "Desenvolvido pela" + arte oficial
        PADCON Platform (`public/brand/padcon-platform-word.png`, inclui o subtitulo
        "Advanced Systems Architecture" na propria arte). Sem wordmark PADAXOR no rodape,
        sem linhas extras de texto.
3. PAINEL VERDE (DOCUMENTO VERIFICADO):
   3.1. MESMA proporcao de relevo 3D e mesma altura nos dois temas (mesmo padding, mesmo translateY).
   3.2. Sombra NAO pode invadir/escurecer o painel de baixo: reduzir o alcance vertical da sombra
        (camadas de 64px/96px caem para alcance que morre antes do painel seguinte) nos DOIS temas.
4. PAINEIS DE DADOS (4 blocos com PanelHeader):
   4.1. Mesmas alturas e espacamentos nos dois temas; conferir painel por painel.
5. FRASES/NOMES/SUBTITULOS:
   5.1. Conferir todos os textos visiveis: sem "PADCOM" indevido, sem subtitulo trocado.
   5.2. Subtitulo do PADAXOR permanece "Motor Clinico · Protocolos Injetaveis".

## Casos extremos

- PNG transparente sobre fundo creme: conferir contraste por screenshot (ouro sobre creme).
- Sticky footer nao pode cobrir o ultimo painel: manter padding-bottom no main se preciso.

## Definicao de PRONTO

- Screenshot claro + escuro mostrando cabecalho/rodape com mesma altura e mesma marca.
- Painel verde sem sombra invadindo o painel seguinte nos dois temas.
- Rodape com PADCON Platform oficial + "Advanced Systems Architecture".
- Aprovacao do architect sem pendencia.

## Linhas vermelhas

- NAO tocar rotas nem API (`/api/receituario/consulta`).
- NAO recriar wordmark PADAXOR ou PADCON em texto/CSS (ativo grafico fechado).
- NAO aplicar filtro/blend na imagem do wordmark.
