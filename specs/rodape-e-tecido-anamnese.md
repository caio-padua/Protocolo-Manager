# Spec — Rodapé e Tecido da Anamnese do Cliente (/anamnese/v2)

Data: 24/06/2026. Autor: Dr. Replit Paxter. Acionado pelo CEO Dr. Caio via Paxter Loop.

## Objetivo (uma frase)

Alinhar e proporcionar as duas marcas do rodapé (Instituto Pádua e PADCON), unificar a textura
("tecido") do cabeçalho com a das questões, prolongar o painel das iniciais dos grupos até o topo e
afinar o perfil dos cartões de questão — tudo preservando o sistema de design Paxter (relevos 3D,
botões, logos, relevos brancos e o neon lento dos alertas).

## Requisitos exatos (numerados)

### Rodapé (REVISADO em 24/06/2026 após feedback do CEO — imagem IMG_5222)
O CEO reprovou a 1ª versão (símbolo alinhado pelo topo, 1,5x) por falta de capricho. Direção nova,
aprovada por screenshot:
1. O SÍMBOLO de cada marca fica à ESQUERDA do nome (Pádua e PADCON), formando um LOGOTIPO coeso
   (símbolo + wordmark próximos).
2. Os dois SÍMBOLOS parecem do MESMO tamanho visual (o D+P é vazado/fino, o PADCON é cheio/sólido;
   na mesma altura o cheio "pesa" mais, então compensa-se a altura: D+P `size=46`, PADCON `height=40`).
3. BASE COMUM: símbolo e wordmark de cada lado assentam na MESMA linha de base (`items-end`); os dois
   logotipos também compartilham a mesma base (outer `items-end`).
4. OURO UNIFICADO: os dois lados no MESMO tom de ouro. O símbolo D+P (gradiente CSS, controlável) foi
   deixado mais vivo; a arte oficial PNG do "Instituto Pádua" (ouro fosco escuro) recebe filtro CSS
   `saturate(1.5) brightness(1.42)` para aproximar do ouro vivo do PADCON. **Decisão de tom final é do
   CEO (A/B/C) — ver pergunta aberta.** Não se redesenha a arte oficial sem ordem do CEO.
5. A legenda "ENGINEERED BY" fica EM CIMA do lockup da PADCON, alinhada à DIREITA (sobre o fim do
   wordmark). Lado direito.
6. Legenda no lado Pádua, EM CIMA do lockup: texto exato **"DR. CAIO PÁDUA — MEDICAL DIRECTOR"**
   (decisão do CEO, 24/06/2026). Cor tema-consciente: BRANCO intenso no escuro; NAVY intenso
   (`#16294a`) no claro (classe `.footer-credit-padua` — legibilidade sobre o creme).
7. A legenda do Pádua ENCERRA NAS VERTICAIS do logotipo: começa exatamente na vertical esquerda
   (símbolo) e termina na vertical direita (fim do wordmark). Implementação DETERMINÍSTICA: o bloco
   tem largura FIXA = largura natural do logotipo (`w-[172px]`); a linha do logo usa `w-full` +
   `justify-between` (símbolo encosta na esquerda, wordmark na direita); a legenda usa
   `textAlign: justify` + `textAlignLast: justify` para preencher exatamente essa largura. Bloco
   PADCON usa a mesma grade (`w-[180px]`), com a legenda à direita.

### Tecido (textura)
8. Unificar o tecido do CABEÇALHO com o das QUESTÕES (o CEO prefere o das questões). Causa-raiz:
   o cabeçalho usa base `bg-card` (branco puro / navy claro) e a página usa `bg-background`
   (creme / navy escuro); a MESMA classe `.leva-fabric` sobre bases diferentes parece dois tecidos.
   Correção: trocar a base do `<header>` de `bg-card` para `bg-background`. Vale no claro e no escuro.

### Painel das iniciais dos grupos
9. Prolongar o painel `.leva-band` (botões de sigla dos grupos) até o TOPO: encostar no rodapé do
   cabeçalho (sem a folga atual), lendo como continuação. Cantos do topo retos, base arredondada.

### Perfil dos cartões de questão
10. Reduzir um pouco o perfil dos cartões `.leva-card` (de `p-4` para `p-3`) para o tecido aparecer
    mais ao redor. PRESERVAR o relevo 3D (bevel/sombra) — só afinar o respiro interno.

## Casos extremos a tratar
- Tema CLARO: legenda branca sumiria no creme → usar navy intenso no claro (requisito 6).
- Mobile (largura ~402px): as duas marcas + legendas não podem colidir; se colidirem, ajustar
  tamanho/posição (verificar por screenshot em 402 de largura).
- Símbolo 1,5x maior que o nome não pode quebrar o alinhamento de topo das duas marcas.
- Prolongar a banda não pode cobrir os medidores do cabeçalho nem sobrepor conteúdo.

## Definição de PRONTO
- Rodapé: símbolo à esquerda, nomes mesma altura (topo+base), símbolo ≈1,5x topo-alinhado, legenda
  Pádua "DR. CAIO PÁDUA — MEDICAL DIRECTOR" em branco intenso (navy no claro), "Engineered by" em cima.
- Cabeçalho e questões com o MESMO tecido (claro e escuro).
- Banda das iniciais prolongada até o topo.
- Cartões de questão com perfil afinado e tecido mais visível, SEM perder o relevo 3D.
- Validado por SCREENSHOT no tema CLARO e ESCURO (rodapé + topo).
- architect aprova requisito por requisito, zero pendência.

## Linhas vermelhas
- NÃO tocar no motor da anamnese, skip-logic, persistência (flush/rascunho), POST/alarme clínico.
- NÃO mexer no payload de salvar nem na lógica de perguntas.
- NÃO remover relevos 3D, LEDs ou o neon lento dos alertas (só ajustar o que a spec pede).
- Mudanças são de APRESENTAÇÃO apenas.

---

## ATUALIZACAO 24/06/2026 — Rodape SEM simbolos (decisao do CEO, img IMG_5223)

O CEO mudou a direcao do rodape: o simbolo "fica exagerado". Nova forma:

1. REMOVER os dois simbolos (PaduaSymbol e PadconSymbol). Ficam SO os wordmarks
   "Instituto Padua" (esquerda) e "PADCON" (direita).
2. As DUAS legendas ("Dr. Caio Padua — Medical Director" e "Engineered by") na MESMA cor
   (classe .footer-credit-padua: navy no claro / branco no escuro) e MESMA fonte (Lora italico),
   em ITALICO — elegantes para apresentacao. Antes uma era branca e a outra cinza (muted): erro.
3. Proporcao conferida por altura distinta: PaduaWordmark height 34, PadconWordmark height 22.
4. Faixa inferior bem delimitada: div com bg-card + border-border + rounded-xl + shadow-sm + padding.
   NAO fixada (fixed) por causa do selo "Tudo salvo automaticamente" ja fixo embaixo — pendente A/B
   com o CEO (faixa no fim do conteudo x barra fixa sempre visivel).

Validado por screenshot nos dois temas (claro e escuro). architect: PASS.
O requisito antigo "legenda encerra nas verticais do logotipo" NAO se aplica mais (sem simbolo,
o wordmark define a largura; legenda alinhada esq/dir, sem justify).

---

## ATUALIZACAO 24/06/2026 (2a rodada) — CEO reabriu com 8 itens (rodape + tela)

O CEO listou 8 falhas na rodada anterior. Correcoes, todas de APRESENTACAO:

1. (Rodape) As duas legendas NAO ficavam na mesma linha horizontal. CAUSA: estavam em colunas
   [legenda, wordmark] empilhadas com outer `items-end`; como os wordmarks tem alturas diferentes
   (34 x 22), as colunas tinham alturas diferentes e empurravam as legendas para Y diferentes.
   CORRECAO DETERMINISTICA: separar em DUAS rows — row 1 = as duas legendas (`flex justify-between
   items-baseline`, compartilham a baseline) e row 2 = os dois wordmarks (`justify-between items-end`).
2. (Rodape) Legenda colada no nome (pouco respiro). CORRECAO: gap vertical entre as duas rows
   (`mt-2.5`).
3. (Rodape) Faixa ficou CHAPADA — CEO quer RELEVO 3D leve ("up breve", saliente). CORRECAO: trocar
   `bg-card ... shadow-sm` pela classe do sistema `.bevel-3d` (relevo saliente UNLAYERED, vence
   utilitarios Tailwind).
4. (Rodape) Faixa tem de ficar CONGELADA/FIXA no limite inferior, sempre visivel ao rolar
   (decisao do CEO = opcao B). CORRECAO: a faixa de marca virou um container `fixed inset-x-0
   bottom-0 z-30`. CONFLITO resolvido: o selo "Tudo salvo automaticamente" (que ja era fixed)
   foi EMPILHADO dentro do mesmo container, centralizado ACIMA da faixa, sem sobrepor.
   `pb` do root subiu para `pb-36` para o conteudo nunca ficar atras da barra fixa.
5. (Tela) Textura/cores ao redor do PAXTER diferentes do corpo. CAUSA-RAIZ: o `<header>` usava
   `bg-background` (token chapado: navy MUITO escuro 215 44% 8% / creme chapado) enquanto o corpo
   usa `.anamnese-solo` (degrade creme/navy com brilho). Bases diferentes = texturas diferentes.
   CORRECAO: dar ao `<header>` a MESMA classe `.anamnese-solo` da pagina (substitui `bg-background`).
   A emenda no rodape do header fica mascarada pelo `border-b` + pela `.leva-band` colada logo abaixo.
   (NOTA: este item SUBSTITUI o requisito 8 antigo, que mandava usar `bg-background` no header — aquilo
   ainda deixava header chapado x corpo em degrade.)
6. (Tela) Botoes ficavam BRANCOS ao clicar. CAUSA-RAIZ: no tema ESCURO `--primary` e quase branco
   (210 22% 92%); o chip de grupo ATIVO usava `--primary` como fundo + texto branco -> botao branco
   com texto branco (sumia). CORRECAO: `gchipStyle` ativo passou a ser TEMA-CONSCIENTE — no escuro usa
   fundo navy explicito (`#1f4377 -> #15315a`) + texto branco + anel ouro; no claro mantem `--primary`
   (que ja e navy) + texto branco + anel ouro.
7. (Tela) Cartoes de questao nao afinados. O QuestionCard (compartilhado por GroupView e FocusView)
   JA estava `p-3`; faltava o cartao "Seu mapa de saude" (HealthTwin) que ainda era `p-4`. CORRECAO:
   `p-4 -> p-3` para consistencia. (Se o CEO quiser o cartao tambem mais ESTREITO em largura, e
   mudanca nova — pedir confirmacao.)
8. (Processo) CEO cobrou rodar o loop direito. Esta rodada seguiu spec -> build -> screenshot (claro
   e escuro) -> architect. Reclamacao de custo: NAO comentar billing; se insistir, indicar suporte Replit.

Validado por SCREENSHOT tema CLARO e ESCURO (topo + rodape). Truque de forcar tema (readTheme ->
"light") usado SO para o screenshot e REVERTIDO. architect: <pendente nesta rodada>.

---

## ATUALIZACAO 24/06/2026 (3a rodada) — faixa continua + frase inglesa embaixo

CEO reabriu com 2 itens (apresentacao apenas):

1. (Rodape) A faixa fixa NAO pode ser delimitada/curva nas extremidades esquerda/direita: tem de ser
   uma FAIXA LONGITUDINAL CONTINUA na horizontal, de ponta a ponta (full-bleed). Cor = a MESMA do
   PAINEL DE QUESTAO (`.leva-card`), com um relevo "up breve" (saliente leve). CORRECAO: criada classe
   `.footer-brand-band` (UNLAYERED, vence Tailwind) com o mesmo gradiente do `.leva-card` (claro:
   branco->creme; escuro: navy #14304f->#0b1c34), SEM border-radius, com realce no topo + sombra
   ascendente (relevo breve). O container fixo perdeu `max-w/px/pb` (fundo full-bleed); o CONTEUDO
   continua centralizado em `max-w-2xl`. A faixa encosta no limite inferior (sem folga).
2. (Rodape) A frase inglesa "Engineered by" desce para a PARTE DE BAIXO, CENTRALIZADA na largura que o
   nome PADCON ocupa. CORRECAO: lado direito virou coluna [PadconWordmark em cima, "Engineered by"
   centralizado embaixo] (`flex-col items-center` -> a frase centra na largura do wordmark). O lado
   esquerdo mantem a assinatura "Dr. Caio Padua — Medical Director" EM CIMA do wordmark Instituto Padua.
   (Isto SUBSTITUI o requisito da 2a rodada que punha as duas legendas na mesma linha.)

Validado por SCREENSHOT em tema ESCURO (faixa continua + frase centralizada confirmadas). Tema CLARO
nao pode ser reconfirmado nesta rodada: o modulo useScreenTheme ficou em cache no navegador da captura
(o truque readTheme->"light" nao refletiu mesmo apos restart/cache-bust). Mudancas de layout sao
identicas nos dois temas e as cores do claro reusam o gradiente ja provado do `.leva-card`.
architect: PASS (sem regressao). Ajustes pos-review aplicados: (1) bases dos dois wordmarks ALINHADAS via spacers de altura igual nas duas colunas (risco estetico "d" do architect); (2) gradiente escuro da faixa igualado 100% ao .leva-card (stop central 52%).

---

## ATUALIZACAO 24/06/2026 (4a rodada) — 2 legendas EMBAIXO + margem medial + faixa cor do tecido (claro)

Apos ver o print (tema CLARO, iPhone) o CEO pediu 3 ajustes de apresentacao:

1. (Item 1) As DUAS frases tem de ficar na PARTE DE BAIXO e alinhadas. Antes: "Dr. Caio Padua" em
   cima do Padua e "Engineered by" embaixo do Padcon (lados verticais opostos). CORRECAO: as duas
   colunas viraram [wordmark EM CIMA, legenda EMBAIXO]; com `items-end` + legendas de mesma altura,
   as duas legendas pousam na MESMA base e os wordmarks tambem. (Dispensa os spacers da 3a rodada.)
2. (Item 2) Puxar os dois blocos mais para o MEDIAL p/ nao cortar em iPhone. CORRECAO: padding lateral
   da faixa de `px-4` para `px-6`.
3. (Item 3) No tema CLARO a faixa estava BRANCA; o CEO pediu o tom do "tecido" (fundo da tela),
   mesma cor SEM a textura. CORRECAO: `.footer-brand-band` (claro) deixou o gradiente branco e passou
   a usar o gradiente creme do `.anamnese-solo` (#ece1c8 -> #e6d9bd -> #ded0b0), SEM o realce radial
   (textura). Relevo (realce no topo + sombra) mantido, com inset highlight suavizado p/ creme.

Validado por SCREENSHOT no tema CLARO (o que o CEO usa): 2 legendas embaixo e alinhadas, blocos
mediais, faixa creme. architect: PASS.

---

## ATUALIZACAO 24/06/2026 (5a rodada) — centralizar logo sobre a frase + contorno preto + area segura

CEO (apos print iPhone, tema claro) pediu 3 refinamentos:

1. NAO e a frase que alinha ao logo; e o LOGO que centraliza sobre a frase: o MEIO (eixo central
   horizontal) do INSTITUTO PADUA tem de coincidir com o MEIO da frase de baixo. CORRECAO: a coluna
   esquerda passou de `items-start` para `items-center` (a direita PADCON ja era center). Agora cada
   logo fica centralizado sobre sua legenda (meio-com-meio).
2. A faixa nao pode ser cortada pelo "chao"/quina inferior do iPhone. CORRECAO: a faixa passou a
   respeitar a AREA SEGURA do iOS: `paddingBottom: calc(0.625rem + env(safe-area-inset-bottom))`
   (mantendo o fundo full-bleed ate a borda; so o CONTEUDO sobe acima do indicador inferior).
3. Colocar um CONTORNO PRETO fino p/ dar NITIDEZ aos dois logos (INSTITUTO PADUA e PADCON) sobre o
   creme. CORRECAO: prop `outlined` nos dois componentes (PaduaWordmark/PadconWordmark) = contorno
   em 4 direcoes via `drop-shadow` (offset 0,6px, blur 0, preto 0.7) — borda fina e nitida ao redor
   dos pixels opacos do PNG. No PADUA o contorno e CONCATENADO ao filtro de cor ja existente
   (saturate/brightness) — um unico `filter`, pois dois `filter` se sobrescrevem.

Validado por SCREENSHOT (tema claro, 390px iPhone): logos centralizados sobre as frases, contorno
preto visivel, faixa nao cortada embaixo. architect: PASS.

---

## ATUALIZACAO 24/06/2026 (6a rodada) — contorno mais nitido + estreitar cartoes + respiro

CEO (print iPhone, tema claro) pediu 2 refinamentos:

1. Contorno preto AINDA mais nitido (sobretudo no PADCON, que estava fraco no tema claro). CORRECAO:
   o `CONTORNO_PRETO` (nos dois wordmarks) passou de 4 direcoes (0,6px / preto 0.7) para 8 DIRECOES
   (4 retas 0,7px + 4 diagonais 0,5px / preto 0.92). As diagonais fecham os "vaos" que 4 direcoes
   deixavam — borda continua e nitida do ouro sobre o creme.
2. Estreitar o painel das perguntas (nos DOIS temas) p/ aparecer o "tecido de terno" nas laterais,
   e dar mais RESPIRO entre uma pergunta e outra. CORRECOES (layout, vale nos dois temas):
   - respiro LATERAL: o `<main>` da anamnese passou de `px-4` para `px-6` (cartoes mais estreitos;
     o creme/tecido aparece nas laterais). O painel de navegacao de grupos (`leva-band`) teve o
     sangramento ajustado de `-mx-4 px-4` para `-mx-6 px-6` p/ continuar full-bleed alinhado.
   - respiro VERTICAL: os cartoes (QuestionCard) foram embrulhados num `flex flex-col gap-5` (antes
     herdavam o `gap-3` da secao) — agora o tecido aparece tambem ENTRE os cartoes.

Validado por SCREENSHOT (tema claro, 390px, altura estendida): contorno nitido, cartoes estreitos
com tecido nas laterais e entre eles. Estreitamento/respiro sao layout puro = identicos no tema
escuro. architect: revisao desta rodada.

---

## ATUALIZACAO 24/06/2026 (7a rodada) — Instituto Padua bem delimitado (opcao C do CEO)

CEO apontou (print tema claro) que o Instituto Padua NAO ficava bem delimitado (a borda fina + ouro
muito clareado faziam o logo "sumir" no creme), enquanto o PADCON ficava melhor. Escolheu a opcao C
(as duas correcoes juntas), aplicadas SO no PaduaWordmark (PADCON intacto):
- Borda mais GROSSA: CONTORNO_PRETO do Padua passou de 0,7px/0,5px (preto 0.92) para 1,0px retas +
  0,8px diagonais (preto 0.95). Continua 8 direcoes, sem blur. De proposito mais grossa que a do
  PADCON, porque a arte do Padua tem traco mais fino e leva filtro de cor.
- Ouro mais CHEIO: filtro de cor do Padua de `saturate(1.5) brightness(1.42) contrast(1.0)` para
  `saturate(1.55) brightness(1.18) contrast(1.08)` — menos clareamento = mais contraste contra o creme.
Validado por SCREENSHOT tema claro 390px: ouro mais cheio, borda nitida, logo recortado. Filtro vale
nos dois temas (efeito na imagem).

---

## ATUALIZACAO 24/06/2026 (8a rodada) — borda EMBUTIDA no Instituto Padua (opcao A do CEO)

CEO (ampliando o print em 3x) provou que o contorno por `drop-shadow` CSS saia IRREGULAR/SUJO (grosso
embaixo, fino em cima, microtexto "INSTITUTO" empastado). Escolheu opcao A: trocar a TECNICA.

CORRECAO (so PaduaWordmark; PADCON intacto):
- Borda preta UNIFORME EMBUTIDA na imagem (novo asset `padua-wordmark-outlined.png`), gerada por
  ImageMagick: clonar, dilatar o canal alfa (Disk:9), pintar de preto, compor a arte original por cima.
  Abraca cada letra por igual; "INSTITUTO" continua legivel.
- REMOVIDO o `drop-shadow` (CONTORNO_PRETO) do componente — fim do halo sujo.
- O componente usa o asset com borda quando `outlined`, senao a arte original. Mantido o filtro de cor
  (ouro mais cheio) que NAO afeta o preto da borda.
- Calibragem: a arte tem 644px mas e exibida ~98px (downscale ~6,5x), por isso Disk:9 (~1,4px aparente).

Validado: assets de teste (Disk 6/9/12 sobre creme) + recorte ampliado da captura AO VIVO no tema claro
— borda limpa, pareja, logo recortado. Borda embutida = vale igual nos dois temas.

---

## ATUALIZACAO 24/06/2026 (9a rodada) — RELEVO 3D no Instituto Padua (CEO rejeitou borda)

CEO reprovou a borda uniforme embutida (8a rodada): "parece adesivo". Comparando com o PADCON ao lado,
pediu RELEVO 3D / bevel / "up" — e notou que o PADCON "so tem alguns contornos no preto" (= os contornos
escuros aparecem SO no lado da sombra do 3D, nao uma borda fechada). Proibido mexer no fundo creme.

VERDADE REGISTRADA (sinceridade): o PADCON salta porque a ARTE dele ja e 3D pesada (letras grossas
biseladas). A arte do Padua e FINA e quase chapada, entao 3D forte e limitado pela arte. Mesmo assim deu
p/ criar relevo real.

CORRECAO (so PaduaWordmark; PADCON e fundo intactos):
- Novo asset `padua-wordmark-outlined.png` agora e a arte com BEVEL + ELEVACAO embutidos (ImageMagick:
  shade do alfa em -compose Overlay = luz no topo / sombra embaixo; -shade 135x18; mais -shadow suave
  p/ flutuar). Resultado: 3D + contornos escuros naturais so no lado da sombra, sem adesivo, sem placa.
- Componente: filtro de cor reduzido p/ `saturate(1.12)` quando 3D (brilho alto achataria o relevo).
- Altura mantida em 33 (proporcao do asset 3D ~3,18 vs original 3,27).

Validado por recorte ampliado (3,8x) da captura AO VIVO no tema claro. Fundo creme nao tocado.

---

## ATUALIZACAO 24/06/2026 (10a rodada) — relevo 3D no PAXTER e na frase EN (SO tema claro)

CEO pediu o MESMO tratamento de relevo (feito no Padua) no logo PAXTER do topo e na frase em ingles
"CLINICAL INTELLIGENCE SYSTEM", no tema CLARO. Diferenca-chave: PAXTER e frase NAO sao imagem — o
PAXTER e SVG vetorial (PaxterWordmarkPremium) e a frase e TEXTO (PaxterTextShimmer). Entao o relevo
e por sombra/edge de CSS/SVG, nao ImageMagick. Proibido forkar o motor de luz (glint) e mexer no fundo.

PAXTER (PaxterWordmarkPremium): adicionada prop `tone` (default "dark", nada muda no escuro). No claro:
- borda das letras troca de CLARA (#FFF1A8, some no creme) p/ ESCURA (#3a2206, espessura 1.1);
- filtro de relevo ganha um contorno escuro fino so no claro (feDropShadow #241000) + brilho de topo
  e sombra de base ajustados. Resultado: ouro delimitado + 3D, "contorno escuro" so na transicao.

Frase EN (PaxterTextShimmer): no claro recebe text-shadow de relevo (sombra escura embaixo + brilho
claro em cima), passado por `style` no BrandMark. Para a faixa de luz (shine) nao duplicar a sombra,
a classe .shine ganhou `text-shadow: none`.

Validado por recorte ampliado (3,2x) da captura AO VIVO no tema claro. Escuro e fundo intactos.

---

## ATUALIZACAO 24/06/2026 (11a rodada) — ALTO-RELEVO real no PAXTER (claro)

CEO pediu p/ "surpreender": PAXTER com ALTO-RELEVO de verdade no claro/creme (tecido de terno),
no espirito do Padua, "nem que precise recriar". A 10a rodada (sombra fina) ficou sutil demais.

Recriada a PROFUNDIDADE do PAXTER no claro: substituimos a sombra de 1 camada por uma EXTRUSAO 3D
real — 13 copias escuras (gradiente goldDepth) empilhadas, cada uma deslocada p/ baixo+direita
(passo x*0.45 / y*1.25), desenhadas de tras p/ a frente, formando a parede lateral das letras. A
face dourada + contorno escuro + filtro de lift seguem por cima; o motor de luz (glint) intacto.
So no claro (tone="light"); o escuro mantem a profundidade minima original. Frase EN: text-shadow
de relevo reforcado (multi-camada escura embaixo + brilho claro em cima). Validado por recorte
ampliado (3,2x) da captura ao vivo.

---

## ATUALIZACAO 24/06/2026 (12a rodada) — "esmeril" no contorno do PAXTER (claro)

CEO apontou (com foto) que a 11a rodada deixou o contorno "carcomido", tipo mordido por alicate de
unha, e pediu p/ "passar um esmeril" e deixar o 3D liso/perfeito. Diagnostico: (1) o STROKE escuro
da face seguia cada micro-ondulacao do vetor potrace (WORD_LETTERS) e os cantos viravam dentes; (2)
a extrusao de 13 copias com passo grande deixava escadinha (degraus) na parede.

Esmeril aplicado (so no claro): (1) removido o stroke duro da face — delimitacao agora por contorno
SUAVE em halo (2 drop-shadow no fLift: rim macio dx0/dy0 std0.9 + sombra curta dy0.7); (2) extrusao
adensada de 13->26 copias finas (passo x*0.22 / y*0.62) = parede continua sem degraus; (3) blur leve
(filtro fWall, feGaussianBlur 0.7) funde as copias da parede; (4) junções arredondadas
(strokeLinejoin/linecap round). Escuro e motor de luz intactos. Validado por recorte 4,2x ao vivo.
