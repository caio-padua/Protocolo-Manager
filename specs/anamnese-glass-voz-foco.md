# Spec — Anamnese Paxter validada: vidro, contraste, logo original, modo foco, voz e alinhamento

Loop Paxter (ESPECIFICAR -> CONSTRUIR -> REVISAR). Alvo: a anamnese VALIDADA (a do
Paxter confirmado com a faísca), nos DOIS temas — claro ("clara") e escuro ("escura").
Motor unico: `artifacts/mockup-sandbox/src/components/mockups/_shared/levaAnamnese.tsx`
(prop `theme` "light"/"dark"), com o medalhao do simbolo em `_shared/PaxterLogo.tsx`
-> `_shared/PaxterSymbolPremium.tsx` e estilos em `_shared/paxter3d.ts`.

## Objetivo (uma frase)

Elevar a anamnese validada do Paxter com vidro sobre o simbolo e a barra, simbolo maior e
mais destacado (claro e escuro), logo original sem CAPS, modo foco, alto-falante que le cada
pergunta em voz feminina elegante e gravacao de audio onde fizer sentido, com alinhamento
travado (posicoes nunca mudam com o tamanho da pergunta) no desktop e nos celulares atuais.

## Requisitos exatos (numerados)

1. VIDRO SOBRE O SIMBOLO (claro e escuro): a cupula de vidro perolizado deve cobrir o medalhao
   INTEIRO, englobando tambem o ARO dourado em volta do simbolo (como estava antes), nao so o
   centro. Vidro bonito e sutil; nunca lavar/apagar o ouro do simbolo.

2. SIMBOLO MAIOR: aumentar levemente o simbolo dentro do quadradinho (de 64px para ~72px),
   mantendo respiro interno (o simbolo nao encosta na borda do medalhao).

3. CONTRASTE NO ESCURO: o medalhao (botao do simbolo) deve ficar com tom um pouco MAIS ESCURO
   que o painel logo abaixo dele, para o simbolo + a faisca + o vidro saltarem. O "bege"/tom
   atual do medalhao no escuro deve ser puxado um tom a mais para realcar simbolo e vidro.

4. CONTRASTE NO CLARO (a dor do CEO): no tema claro o simbolo fica pouco destacado sobre o
   painel branco. Criar uma solucao honesta para destacar — sem mentir sobre o estado atual.
   Estrategia proposta: medalhao com fundo "champanhe" um tom acima do painel + halo/aura
   discreta atras do simbolo + aro dourado mais definido, para o simbolo ganhar figura-fundo.

5. VIDRO NA BARRA DE EVOLUCAO: aplicar uma camada de vidro (brilho perolizado sutil) por cima
   da barrinha de etapas ("ETAPA X DE 8"), nos dois temas, mantendo os segmentos atuais.

6. LOGO ORIGINAL, SEM CAPS: parar de exibir a versao tipografica em CAIXA ALTA; exibir a arte
   ORIGINAL aprovada do logo (asset de marca), definindo posicao/local. Default proposto:
   lockup oficial (simbolo + assinatura original) centralizado no topo, sobre fundo escuro no
   tema escuro; no tema claro, a assinatura em tom escuro legivel.

7. MODO FOCO: adicionar um botao de "modo foco" que reduz distracoes — esconde elementos
   secundarios (rodape/extras) e centraliza a pergunta atual + respostas, com leve escurecimento
   do entorno. Toggle visivel e reversivel.

8. VOZ (alto-falante em TODA pergunta): cada pergunta recebe um icone de alto-falante; ao clicar,
   o texto da pergunta (e opcoes quando fizer sentido) e LIDO em voz feminina elegante, jovem,
   o mais natural possivel, em portugues do Brasil. Estado visivel de "lendo" (parar/repetir).
   A FONTE da voz e a decisao travada abaixo (ver "Decisao pendente").

9. GRAVACAO DE AUDIO (onde faz sentido): perguntas abertas/descritivas ganham botao de GRAVAR
   audio (o cliente responde falando), com gravar/parar/regravar e indicador de duracao. Onde nao
   faz sentido gravar (escolha binaria/multipla), NAO colocar gravacao — so o alto-falante.

10. ALINHAMENTO TRAVADO (linhas imaginarias): as POSICOES nunca mudam com o tamanho da pergunta;
    o tamanho do painel pode crescer, as posicoes nao. Os botoes de resposta NAO podem reflowar
    (proibido "3 em cima e 1 embaixo" ou virar coluna so porque o texto e maior). Grade de
    colunas FIXA por quantidade de opcoes; validar no desktop e nas larguras dos celulares atuais
    (referencia 360, 390/393, 430 px de largura).

## Casos extremos a tratar

- Voz: navegador sem voz pt-BR feminina disponivel -> degradar com elegancia (desabilitar com
  dica), nunca quebrar. Parar a leitura ao trocar de pergunta ou sair.
- Gravacao: permissao de microfone negada -> mensagem clara, sem travar o fluxo.
- Vidro: nao reduzir contraste do texto nem do ouro; conferir nos dois temas.
- Alinhamento: pergunta muito longa nao pode empurrar/quebrar a grade de botoes.
- Modo foco: ao ligar/desligar, nada de "pulo" de layout; reversao limpa.

## Definicao de PRONTO (conferivel)

- Vidro cobre o medalhao inteiro (com o aro) nos dois temas; barra com vidro nos dois temas.
- Simbolo ~72px com respiro; medalhao escuro mais escuro que o painel; claro com simbolo
  destacado (figura-fundo resolvida).
- Logo original (sem CAPS) posicionado nos dois temas.
- Modo foco liga/desliga sem pulo.
- Alto-falante em todas as perguntas lendo em voz feminina pt-BR; gravacao so onde faz sentido.
- Botoes de resposta com posicao FIXA (sem reflow) validado por screenshot em desktop e em
  360/390/430 px.
- Architect aprova requisito por requisito, zero pendencia.
- Entregue como nova ENTREGA numerada no Canvas (claro + escuro), com presentArtifact.

## Linhas vermelhas

- NAO alterar o motor de calculo/skip-logic da anamnese nem o payload de salvar por estetica.
- NAO descaracterizar o simbolo validado com a faisca (so acrescentar vidro/realce).
- NAO inventar auth nem tocar rotas de API.
- Mudanca e de APRESENTACAO; preservar identificadores tecnicos.

## Decisao pendente (trava a arquitetura da voz)

Fonte da voz feminina elegante para o alto-falante (requisito 8) — ver pergunta ao CEO.
