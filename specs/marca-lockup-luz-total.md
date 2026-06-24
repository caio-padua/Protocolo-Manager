# Spec — Conjunto da marca PAXTER com luz total em todas as telas

Data: 24/06/2026. Decisão do CEO Dr. Caio. Loop Paxter (Fase 1 — Especificar).

## Objetivo (uma frase)
Unificar o conjunto da marca — símbolo de vidro + nome PAXTER + frase "Clinical Intelligence
System" — com a luz lisa (raster, sem serrilhado), o nome com o refinamento "Respiro especular"
e a frase brilhando junto, numa FONTE ÚNICA reutilizável, presente com todos os efeitos em todas
as telas do sistema.

## Decisões já travadas com o CEO
1. Refinamento escolhido: Opção A — Respiro especular (mantém 100% da base spark+sweep e só
   ACRESCENTA um brilho dourado que pulsa devagar). Nada se perde.
2. A frase "Clinical Intelligence System" TAMBÉM brilha: a mesma luz percorre o nome e a frase,
   sincronizadas (escolha do CEO).
3. A frase do conjunto é "Clinical Intelligence System" (inglês).

## Requisitos exatos
1. A frase "Clinical Intelligence System" NÃO é texto chapado (PaxterTextShimmer plano NÃO serve).
   A frase tem o MESMO acabamento 3D ouro do nome porque vem da arte oficial `paxter-headline.png`
   (PAXTER + frase no mesmo bisel 3D). A luz percorre o nome E a frase numa ÚNICA passada (estão
   na mesma imagem). Máscara da luz: `paxter-headline-clean.png`, gerada da headline binarizando o
   canal alpha (remove a sombra suave), mesma lógica do par paxter-paxter / paxter-paxter-clean.
2. Motor ÚNICO `PaxterRasterGlow` (face raster + máscara da arte limpa + luz): spark (faísca) +
   sweep (sol) + "Respiro especular" (camada dourada mascarada, mix-blend screen, pulsa devagar,
   pico baixo ~0,17, o ciclo todo). Respeita prefers-reduced-motion (toda luz off). `PaxterWordmarkArt`
   (só nome) e `PaxterHeadlineArt` (nome + frase) são wrappers finos do MESMO motor — nunca forks.
3. FONTE ÚNICA `PaxterLockup` (components/layout/paxter-fx/) monta TODO conjunto: símbolo
   (PaxterSymbolGlass) + headline (PaxterHeadlineArt) — ou só nome quando showTagline=false. Luz em
   CASCATA no ciclo de 12s: símbolo lidera (delay 0), nome+frase entram ~900ms. Props: orientation
   ("vertical" | "horizontal"), symbolPx, wordWidth, tone ("dark" | "light"), showTagline (bool),
   href (link opcional), className. NENHUMA outra montagem do conjunto é permitida.
4. Sidebar (components/layout/PaxterLogo.tsx): usa a fonte única. Modos: sm (horizontal, barra
   mobile, COM frase), md (vertical, topo da sidebar, com frase), collapsed (só símbolo — estado
   recolhido, frase impossível por design). Sem PaxterWordmarkPremium (SVG serrilhado).
5. Tela agendar (pages/agendar.tsx): cabeçalho usa a fonte única — conjunto completo (nome + frase
   3D com a mesma luz).
6. Branding em modo app (variant "appHeader"/"compact" de components/branding/PaxterLogo.tsx):
   AMBAS montam pela fonte única PaxterLockup com showTagline (frase presente). O modo "hero"
   (site institucional, com Precision + subtitle) fica FORA desta onda.
7. Nenhum uso de PaxterWordmarkPremium (SVG serrilhado) em tela de produto. O arquivo pode
   permanecer no repositório, mas sem uso nessas telas.

## Casos extremos a tratar
1. prefers-reduced-motion: respiro, sweep e spark TODOS desligam (nome e frase juntos, mesma luz).
2. Tom claro (painéis creme): a face é a arte LIMPA (sem halo) em blend normal — ouro 3D legível
   sobre creme. A luz (mix-blend screen) fica naturalmente sutil/invisível no claro; aceitável,
   pois a face 3D permanece nítida (limitação física do screen em fundo claro).
3. Sidebar recolhida (collapsed): só o símbolo; nome e frase impossíveis nesse estado por design.
4. Larguras do nome/headline: sidebar sm=132, md=176, agendar=130, appHeader=244, compact=176.
5. Não introduzir brilho reativo a toque no celular (as luzes são automáticas em ciclo — ok).
6. Cascata nunca pode "piscar" desencontrado: símbolo e headline (nome+frase) no MESMO ciclo de 12s.

## Definição de PRONTO (conferível)
1. Screenshot do topo da sidebar (md): símbolo de vidro + PAXTER liso (sem serrilhado) + frase,
   todos com a luz; a frase brilha em cascata após o nome.
2. Screenshot do cabeçalho de agendar: conjunto com a luz (nome liso + frase brilhando).
3. Screenshot de pelo menos uma tela que usa o branding appHeader/compact: nome com luz.
4. grep sem nenhum uso de PaxterWordmarkPremium em pages/ e em layout/PaxterLogo.tsx.
5. typecheck do padcom sem NOVOS erros (há erros pré-existentes — comparar antes/depois).
6. architect aprova requisito por requisito, zero pendência.

## Linhas vermelhas
1. NÃO tocar motores de cálculo/orçamento/anamnese/agenda.
2. NÃO alterar PaxterSymbolGlass / PaxterSymbolPremium (símbolo já validado) — só reusar.
3. NÃO alterar a arte oficial (PNGs da marca); a luz corre por cima via máscara.
4. PRESERVAR a técnica raster+mask do nome; NUNCA voltar ao SVG serrilhado.
5. NÃO mexer no modo "hero" do branding (site institucional) nesta onda.
6. NÃO mudar a cor/tom validados do ouro nem do medalhão de vidro.
